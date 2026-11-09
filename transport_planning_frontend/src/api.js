async function ensureOk(response) {
    if (response.ok)
        return response;
    let detail = `Ошибка сервера: ${response.status}`;
    try {
        const body = await response.json();
        if (body?.detail)
            detail = body.detail;
    }
    catch {
        // Тело ответа не JSON: оставляем общее сообщение
    }
    throw new Error(detail);
}
const jsonRequest = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});
export async function listProjects() {
    return (await ensureOk(await fetch('/api/projects/'))).json();
}
export async function uploadProject(file) {
    const form = new FormData();
    form.append('file', file);
    return (await ensureOk(await fetch('/api/projects/', { method: 'POST', body: form }))).json();
}
export async function createSampleProject() {
    return (await ensureOk(await fetch('/api/projects/', jsonRequest('POST', { sample: true })))).json();
}
export async function loadProject(id) {
    return (await ensureOk(await fetch(`/api/projects/${id}/`))).json();
}
export async function saveChanges(id, changes) {
    await ensureOk(await fetch(`/api/projects/${id}/changes/`, jsonRequest('PUT', { changes })));
}
export async function exportOsm(id, changes) {
    return (await ensureOk(await fetch(`/api/projects/${id}/export/`, jsonRequest('POST', { changes })))).blob();
}
export async function runPreflight(id, changes) {
    return (await ensureOk(await fetch(`/api/projects/${id}/preflight/`, jsonRequest('POST', { changes })))).json();
}
export async function getAssistantSettings() {
    return (await ensureOk(await fetch('/api/assistant/settings/'))).json();
}
export async function saveAssistantSettings(payload) {
    return (await ensureOk(await fetch('/api/assistant/settings/', jsonRequest('PUT', payload)))).json();
}
export async function testAssistant(payload) {
    return (await ensureOk(await fetch('/api/assistant/test/', jsonRequest('POST', payload)))).json();
}
export async function assistantChat(messages, tools, signal) {
    const request = { ...jsonRequest('POST', { messages, tools }), signal };
    return (await ensureOk(await fetch('/api/assistant/chat/', request))).json();
}
