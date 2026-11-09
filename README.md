# transport-planning

Репозиторий для решения по хакатону Транспортное планирование городов команды Клодмены :))

Графический редактор улично-дорожной сети: открывает `.osm`, позволяет визуально править граф и
сохраняет результат в `.osm`, который затем проверяется в MatSim, SUMO и Webots.

## Запуск

Нужны Python 3.12 и Node.js 22.18 или новее.

Бэкенд, в первом терминале:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r req.txt
cd transport_planning
../.venv/Scripts/python manage.py migrate
../.venv/Scripts/python manage.py runserver
```

Фронтенд, во втором терминале:

```bash
cd transport_planning_frontend
npm install
npm run dev
```

Редактор откроется на <http://localhost:5173>. На стартовой странице можно выбрать свой `.osm` или
открыть пример `transport_planning/samples/example.osm`.

Для проверки файла сборкой в SUMO прямо из редактора дополнительно поставьте `eclipse-sumo`
или задайте переменную `SUMO_HOME`:

```bash
.venv/Scripts/python -m pip install eclipse-sumo
```

## Как устроено

| Часть | Где лежит | Что делает |
|---|---|---|
| Чтение и запись `.osm` | `transport_planning/editor/osm_io.py` | Накладывает правки на исходный XML, всё нетронутое остаётся как было |
| API | `transport_planning/editor/views.py` | Проекты, автосохранение правок, экспорт, проверка через `netconvert` |
| Модель графа | `transport_planning_frontend/src/core/doc.ts` | Рабочая копия, транзакции, отмена и повтор, вычисление правок |
| Операции | `transport_planning_frontend/src/core/ops.ts` | Разрез, склейка, разворот, запреты поворота и другие |
| Отрисовка | `transport_planning_frontend/src/core/scene.ts`, `src/map/` | Полосы, перекрёстки, траектории на MapLibre |
| Проверки сети | `transport_planning_frontend/src/core/validate.ts` | Ошибки связности, направлений, перекрёстков и атрибутов |

Правки хранятся отдельно от исходного файла и накладываются на него при экспорте. Новые объекты
получают положительные id выше всех существующих. Здания, маршруты и другие объекты, которые редактор
не меняет, переходят в итоговый файл без изменений.

## Тесты

```bash
cd transport_planning
../.venv/Scripts/python manage.py test editor
```

```bash
cd transport_planning_frontend
npm test
npm run type-check
```

## Горячие клавиши

В редакторе их список открывается клавишей F1. Основные: `V` выбор, `D` дорога, `N` узел, `X` разрез,
`T` светофор, `C` переход, `B` мост, `G` тоннель, `F` развернуть, `M` склеить, `U` расклеить,
`J` объединить, `[` и `]` число полос, `Ctrl+Z` и `Ctrl+Y` отмена и повтор.
