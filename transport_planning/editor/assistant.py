"""Подключение помощника к языковой модели через протокол, совместимый с OpenAI.

Адрес, модель и ключ задаются отдельно: один и тот же код работает и с облачным сервисом,
и с локальным сервером вроде Ollama или LM Studio. Ключ остаётся на сервере и не уходит в браузер.
"""

from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from .models import AssistantSettings

CHAT_TIMEOUT_S = 300
TEST_TIMEOUT_S = 15
MAX_MESSAGES = 300
MAX_ERROR_CHARS = 400
TEMPERATURE = 0.2
MASK = '***'


class AssistantError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass
class Config:
    base_url: str
    model: str
    api_key: str
    locked: bool


def _env(name: str) -> str:
    return os.environ.get(name, '').strip()


def is_locked() -> bool:
    """При размещении для других людей настройки задаёт администратор, а не любой посетитель."""
    return _env('LLM_SETTINGS_LOCKED') == '1'


def current_config() -> Config:
    locked = is_locked()
    saved = None if locked else AssistantSettings.objects.filter(pk=1).first()
    return Config(
        base_url=(saved.base_url if saved and saved.base_url else _env('LLM_BASE_URL')),
        model=(saved.model if saved and saved.model else _env('LLM_MODEL')),
        api_key=(saved.api_key if saved and saved.api_key else _env('LLM_API_KEY')),
        locked=locked,
    )


def public_settings() -> dict[str, Any]:
    """То, что можно показать в браузере. Самого ключа здесь нет и быть не должно."""
    config = current_config()
    return {
        'baseUrl': config.base_url,
        'model': config.model,
        'hasKey': bool(config.api_key),
        'locked': config.locked,
        'configured': bool(config.base_url and config.model),
    }


def normalize_base_url(value: str) -> str:
    """Принимает адрес в том виде, как его копируют из документации сервиса."""
    url = str(value or '').strip().rstrip('/')
    for suffix in ('/chat/completions', '/models'):
        if url.endswith(suffix):
            url = url[: -len(suffix)].rstrip('/')
    if not url:
        return ''
    parts = urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.netloc:
        raise AssistantError('Адрес должен начинаться с http:// или https://', status=400)
    return url


def save_settings(payload: dict[str, Any]) -> None:
    if is_locked():
        raise AssistantError('Настройки помощника заданы администратором сервера', status=403)
    settings, _ = AssistantSettings.objects.get_or_create(pk=1)
    if 'baseUrl' in payload:
        settings.base_url = normalize_base_url(payload.get('baseUrl', ''))
    if 'model' in payload:
        settings.model = str(payload.get('model') or '').strip()
    # Пустой ключ в форме значит «оставить прежний», удаление — отдельное действие
    if payload.get('clearKey'):
        settings.api_key = ''
    elif payload.get('apiKey'):
        settings.api_key = str(payload['apiKey']).strip()
    settings.save()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Переадресация могла бы унести заголовок с ключом на другой сервер."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, 'Сервис вернул переадресацию', headers, fp)


def _scrub(text: str, api_key: str) -> str:
    cleaned = text.replace(api_key, MASK) if api_key else text
    return cleaned[:MAX_ERROR_CHARS]


def _error_detail(body: bytes, api_key: str) -> str:
    text = body.decode('utf-8', errors='replace')
    try:
        data = json.loads(text)
        error = data.get('error', data) if isinstance(data, dict) else data
        if isinstance(error, dict):
            text = str(error.get('message') or error)
        else:
            text = str(error)
    except ValueError:
        pass
    return _scrub(text, api_key)


def _request(config_url: str, path: str, api_key: str, payload: dict | None, timeout: int) -> Any:
    url = f'{config_url}{path}'
    headers = {'Accept': 'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    data = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(url, data=data, headers=headers, method='POST' if data else 'GET')
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        detail = _error_detail(exc.read(), api_key)
        raise _http_error(exc.code, detail) from None
    except (TimeoutError, socket.timeout):
        raise AssistantError(f'Сервис {config_url} не ответил за {timeout} с', status=504) from None
    except (urllib.error.URLError, OSError) as exc:
        reason = getattr(exc, 'reason', exc)
        if isinstance(reason, (TimeoutError, socket.timeout)):
            raise AssistantError(f'Сервис {config_url} не ответил за {timeout} с', status=504) from None
        raise AssistantError(
            f'Не удалось подключиться к {config_url}. Проверьте адрес и запущен ли сервер модели',
        ) from None
    try:
        return json.loads(body)
    except ValueError:
        raise AssistantError('Сервис ответил не в формате JSON. Проверьте адрес: обычно он заканчивается на /v1') from None


def _http_error(code: int, detail: str) -> AssistantError:
    if code in (401, 403):
        return AssistantError(f'Сервис отклонил ключ доступа: {detail}', status=502)
    if code == 404:
        return AssistantError(f'Адрес или модель не найдены: {detail}', status=502)
    if code == 429:
        return AssistantError(f'Превышен лимит запросов или расходов: {detail}', status=502)
    if code == 400 and 'tool' in detail.lower():
        return AssistantError(f'Эта модель не поддерживает вызов функций. Выберите другую: {detail}', status=502)
    return AssistantError(f'Ошибка сервиса модели ({code}): {detail}', status=502)


def list_models(payload: dict[str, Any]) -> list[str]:
    """Проверка подключения. Можно проверить и ещё не сохранённые значения из формы."""
    config = current_config()
    if config.locked:
        base_url, api_key = config.base_url, config.api_key
    else:
        base_url = normalize_base_url(payload.get('baseUrl', '')) or config.base_url
        api_key = str(payload.get('apiKey') or '').strip() or config.api_key
    if not base_url:
        raise AssistantError('Укажите адрес сервиса', status=400)
    data = _request(base_url, '/models', api_key, None, TEST_TIMEOUT_S)
    items = data.get('data', []) if isinstance(data, dict) else []
    names = [str(item.get('id')) for item in items if isinstance(item, dict) and item.get('id')]
    return sorted(names)


def chat(messages: Any, tools: Any) -> dict[str, Any]:
    config = current_config()
    if not config.base_url or not config.model:
        raise AssistantError('Помощник не настроен: укажите адрес сервиса и модель', status=400)
    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        raise AssistantError('Некорректная история сообщений', status=400)
    # Модель и адрес определяет только сервер: из браузера приходят лишь сообщения и список функций
    payload: dict[str, Any] = {
        'model': config.model,
        'messages': messages,
        'temperature': TEMPERATURE,
        'stream': False,
    }
    if isinstance(tools, list) and tools:
        payload['tools'] = tools
        payload['tool_choice'] = 'auto'
    data = _request(config.base_url, '/chat/completions', config.api_key, payload, CHAT_TIMEOUT_S)
    try:
        choice = data['choices'][0]
        message = choice['message']
    except (KeyError, IndexError, TypeError):
        raise AssistantError('Сервис вернул неожиданный ответ: в нём нет сообщения модели') from None
    return {
        'message': {
            'role': 'assistant',
            'content': message.get('content') or '',
            'tool_calls': message.get('tool_calls') or [],
        },
        'finishReason': choice.get('finish_reason'),
        'usage': data.get('usage'),
    }
