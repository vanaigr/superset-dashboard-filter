import fetch, { type Response } from 'node-fetch';

export type Context = {
    base: URL
    csrfToken: string
    authorization: string
    sessionCookie: string | undefined
}

export async function logIn(baseUrl: string | URL, username: string, password: string): Promise<Context> {
    const base = new URL(baseUrl)
    const authResp = await fetch(new URL('api/v1/security/login', base), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            username,
            password,
            provider: 'db',
            //refresh: true,
        }),
    })
    await checkOk(authResp)

    const authorization = (await authResp.json() as any).access_token
    let sessionCookie = getSessionCookie(authResp)

    const csrfResp = await fetch(new URL('/api/v1/security/csrf_token/', base), {
        method: 'GET',
        headers: {
            ...mkAuth({ authorization, sessionCookie }),
            'content-type': 'application/json',
        },
    })
    await checkOk(csrfResp)

    const csrfToken = (await csrfResp.json() as any).result
    sessionCookie = getSessionCookie(csrfResp) || sessionCookie // Programmatic clients famously use cookies...

    return { base, csrfToken, authorization, sessionCookie }
}

export async function getDashboardFiltersDesc(ctx: Context, dashboardId: string): Promise<NativeFilterDesc[]> {
    const dashboardResp = await fetch(
        new URL('api/v1/dashboard/' + encodeURIComponent(dashboardId), ctx.base),
        {
            method: 'GET',
            headers: {
                ...mkAuth(ctx),
                'x-csrftoken': ctx.csrfToken,
            },
        },
    )
    await checkOk(dashboardResp)
    ctx.sessionCookie = getSessionCookie(dashboardResp) || ctx.sessionCookie

    const dashboard = (await dashboardResp.json() as any).result
    const metadata = JSON.parse(dashboard.json_metadata)
    const filtersDesc = metadata.native_filter_configuration

    return filtersDesc
}

export async function genFiltersUrl(
    ctx: Context,
    dashboardId: string,
    filters: Record<string, NativeFilter>
): Promise<string> {
    const uploadResp = await fetch(
        new URL('api/v1/dashboard/' + encodeURIComponent(dashboardId) + '/filter_state', ctx.base),
        {
            method: 'POST',
            headers: {
                ...mkAuth(ctx),
                'content-type': 'application/json',
            },
            body: JSON.stringify({ value: JSON.stringify(filters) }),
        },
    )
    await checkOk(uploadResp)

    const uploadRes = await uploadResp.json() as any
    return 'http://localhost:8089/superset/dashboard/' + encodeURIComponent(dashboardId)
        + '/?native_filters_key=' + encodeURIComponent(uploadRes.key)
}

function mkAuth(ctx: { authorization: string, sessionCookie: string | undefined, csrfToken?: string | undefined }) {
    return {
        'authorization': 'Bearer ' + ctx.authorization,
        // Required :/ https://stackoverflow.com/questions/73635954/create-dataset-api-api-v1-dataset-giving-error-400-bad-request-the-csrf-ses#comment137812422_75135127
        ...(ctx.sessionCookie ? { cookie: 'session=' + ctx.sessionCookie } : {}),
        ...(ctx.csrfToken ? { 'x-csrftoken': ctx.csrfToken } : {}),
    }
}

async function checkOk(resp: Response) {
    if(resp.ok) return

    throw new Error(
        'Response status: ' + resp.status + '\n'
            + await resp.text().then(
                it => 'Body: ' + it,
                e => 'Body error: ' + e,
            )
    )
}

function getSessionCookie(resp: Response) {
    const cookies = resp.headers.raw()['set-cookie']
    if(!cookies) return undefined
    for(let i = 0; i < cookies.length; i++) {
        const c = cookies[i]
        const nameEnd = c.indexOf('=')
        if(nameEnd === -1) {
            console.warn('Invalid cookie: ' + c)
            continue
        }
        const name = c.substring(0, nameEnd)
        if(name !== 'session') continue

        let valueEnd = c.indexOf(';')
        if(valueEnd === -1) valueEnd = c.length

        return c.substring(nameEnd + 1, valueEnd)
    }
}

function deepClone<T>(it: T) {
    return JSON.parse(JSON.stringify(it))
}


export type FilterType = 'filter_range' | 'filter_select' | 'filter_time' | 'filter_timegrain' | 'filter_timecolumn'

export type BaseNativeFilterDesc = {
    cascadeParentIds: string[]
    //controlValues: unknown
    //defaultDataMask: unknown
    description: string
    //filterType?: undefined
    id: string
    name: string
    scope: {
        excluded: string[]
        rootPath: string[]
    }
    targets: Array<{
        column: {
            name: string
        }
        datasetId: number
    }>
    type: 'NATIVE_FILTER'
    chartsInScope: number[]
    tabsInScope: string[]
}

export type SelectExtraFormData = {
    filters: Array<{
        col: string
        op: string
        val: string[]
    }>
}
export type SelectFilterState = {
    // validateStatus: boolean
    // validateMessage: false | string
    // label: string
    value: string[]
    excludeFilterValues: boolean // only applies if inverseSelection is set
}
export type SelectNativeFilterDesc = {
    controlValues: {
        creatable: boolean
        defaultToFirstItem: boolean
        enableEmptyFilter: boolean
        inverseSelection: boolean
        multiSelect: boolean
        searchAllOptions: boolean
    }
    defaultDataMask: {
        extraFormData: SelectExtraFormData
        filterState: SelectFilterState
    }
    filterType: 'filter_select'
} & BaseNativeFilterDesc

export type TimeExtraFormData = {
    time_range?: string
}
export type TimeFilterState = {
    // ...
    value: TimeFilterValues | string
}
export type TimeNativeFilterDesc = {
    controlValues: {
        enableEmptyFilter: boolean
    }
    defaultDataMask: {
        extraFormData: TimeExtraFormData
        filterState: TimeFilterState
    }
    filterType: 'filter_time'
} & BaseNativeFilterDesc

export type RangeExtraFormData = {
    filters: Array<{
        col: string
        op: string
        val: number
    }>
}
export type RangeFilterState = {
    value: [number, number]
}
export type RangeNativeFilterDesc = {
    controlValues: {
        enableEmptyFilter: boolean
    }
    defaultDataMask: {
        extraFormData: RangeExtraFormData
        filterState: RangeFilterState
    }
    filterType: 'filter_range'
} & BaseNativeFilterDesc

export type TimegrainExtraFormData = {
    time_grain_sqla?: string
}
export type TimegrainFilterState = {
    value: string
}
export type TimegrainNativeFilterDesc = {
    controlValues: {
        enableEmptyFilter: boolean
    }
    defaultDataMask: {
        extraFormData: TimegrainExtraFormData
        filterState: TimegrainFilterState
    }
    filterType: 'filter_timegrain'
} & BaseNativeFilterDesc

export type TimecolumnExtraFormData = {
    granularity_sqla?: string
}
export type TimecolumnFilterState = {
    value: [string]
}
export type TimecolumnNativeFilterDesc = {
    controlValues: {
        enableEmptyFilter: boolean
    }
    defaultDataMask: {
        extraFormData: TimecolumnExtraFormData
        filterState: TimecolumnFilterState
    }
    filterType: 'filter_timecolumn'
} & BaseNativeFilterDesc

export type NativeFilterDesc = SelectNativeFilterDesc | TimeNativeFilterDesc | RangeNativeFilterDesc
    | TimegrainNativeFilterDesc | TimecolumnNativeFilterDesc


export function mkFilters(descs: NativeFilterDesc[]): Record<string, NativeFilter> {
    const res: Record<string, NativeFilter> = {}
    for(let i = 0; i < descs.length; i++) {
        const desc = descs[i]
        if(desc.filterType === 'filter_select') {
            res[desc.id] = selectDefaultValue(desc)
        }
        else if(desc.filterType === 'filter_time') {
            res[desc.id] = timeDefaultValue(desc)
        }
        else if(desc.filterType === 'filter_range') {
            res[desc.id] = {
                id: desc.id,
                extraFormData: deepClone(desc.defaultDataMask.extraFormData),
                filterState: deepClone(desc.defaultDataMask.filterState),
                ownState: {},
            } satisfies RangeNativeFilter
        }
        else if(desc.filterType === 'filter_timegrain') {
            res[desc.id] = {
                id: desc.id,
                extraFormData: deepClone(desc.defaultDataMask.extraFormData),
                filterState: deepClone(desc.defaultDataMask.filterState),
                ownState: {},
            } satisfies TimegrainNativeFilter
        }
        else if(desc.filterType === 'filter_timecolumn') {
            res[desc.id] = {
                id: desc.id,
                extraFormData: deepClone(desc.defaultDataMask.extraFormData),
                filterState: deepClone(desc.defaultDataMask.filterState),
                ownState: {},
            } satisfies TimecolumnNativeFilter
        }
        else {
            console.warn('Unknown filter type:', (desc as any).filterType)
        }
    }
    return res
}


export function selectWithIncludedValue(
    desc: SelectNativeFilterDesc,
    filter: SelectNativeFilter,
    newValue: string[]
): SelectNativeFilter {
    // https://github.com/apache/superset/blob/aea776a131e36806f882941f05c190021edcb06b/superset-frontend/src/dashboard/components/nativeFilters/FilterBar/FilterControls/FilterValue.tsx#L101-L121
    const col = desc.targets[0].column.name

    return {
        ...filter,
        extraFormData: {
            filters: [{
                col,
                op: 'IN',
                val: newValue,
            }],
        },
        filterState: {
            value: newValue,
            excludeFilterValues: false,
        },
    }
}
export function selectWithNoValue(
    desc: SelectNativeFilterDesc,
    filter: SelectNativeFilter,
): SelectNativeFilter {
    return {
        ...filter,
        extraFormData: { filters: [] },
        filterState: {},
    }
}
export function selectDefaultValue(desc: SelectNativeFilterDesc): SelectNativeFilter {
    return {
        id: desc.id,
        extraFormData: deepClone(desc.defaultDataMask.extraFormData),
        filterState: deepClone(desc.defaultDataMask.filterState),
        ownState: {},
    }
}


export function timeWithBuiltinValue(
    desc: TimeNativeFilterDesc,
    filter: TimeNativeFilter,
    newValue: TimeFilterValues,
): TimeNativeFilter {
    return {
        ...filter,
        extraFormData: {
            time_range: newValue,
        },
        filterState: {
            value: newValue,
        },
    }
}
/// NOTE: date values are extracted in UTC.
/// NOTE: range is end-exclusive
export function timeWithDateRange(
    desc: TimeNativeFilterDesc,
    filter: TimeNativeFilter,
    beginDate: Date,
    endDate: Date,
): TimeNativeFilter {
    let b = beginDate.toISOString()
    b = b.substring(0, b.length - 1)

    let e = endDate.toISOString()
    e = e.substring(0, e.length - 1)

    const range = b + ' : ' + e

    return {
        ...filter,
        extraFormData: {
            time_range: range,
        },
        filterState: {
            ...filter.filterState,
            value: range,
        },
    }
}
export function timeWithNoValue(
    desc: TimeNativeFilterDesc,
    filter: TimeNativeFilter,
): TimeNativeFilter {
    return {
        ...filter,
        extraFormData: {},
        filterState: {},
    }
}
export function timeDefaultValue(
    desc: TimeNativeFilterDesc
): TimeNativeFilter {
    return {
        id: desc.id,
        extraFormData: deepClone(desc.defaultDataMask.extraFormData),
        filterState: deepClone(desc.defaultDataMask.filterState),
        ownState: {},
    }
}

// bounds are inclusive
export function rangeWithBounds(
    desc: RangeNativeFilterDesc,
    filter: RangeNativeFilter,
    min?: number,
    max?: number
): RangeNativeFilter {
    const col = desc.targets[0].column.name

    const filters: RangeNativeFilter['extraFormData']['filters'] = []
    if(min !== undefined) {
        filters.push({ col, op: '>=', val: min })
    }
    if(max !== undefined) {
        filters.push({ col, op: '<=', val: max })
    }

    return {
        ...filter,
        extraFormData: { filters },
        filterState: {
            value: [min ?? null, max ?? null],
            excludeFilterValues: false,
        },
    }
}
export function rangeWithNoValue(
    desc: RangeNativeFilterDesc,
    filter: RangeNativeFilter,
): RangeNativeFilter {
    return {
        ...filter,
        extraFormData: { filters: [] },
        filterState: {},
    }
}
export function rangeDefaultValue(
    desc: RangeNativeFilterDesc
): RangeNativeFilter {
    return {
        id: desc.id,
        extraFormData: deepClone(desc.defaultDataMask.extraFormData),
        filterState: deepClone(desc.defaultDataMask.filterState),
        ownState: {},
    }
}

export function timegrainWithValue(
    desc: TimegrainNativeFilterDesc,
    filter: TimegrainNativeFilter,
    value: TimegrainFilterValues,
): TimegrainNativeFilter {
    return {
        ...filter,
        extraFormData: { time_grain_sqla: value },
        filterState: { value },
    }
}
export function timegrainWithNoValue(
    desc: TimegrainNativeFilterDesc,
    filter: TimegrainNativeFilter,
): TimegrainNativeFilter {
    return {
        ...filter,
        extraFormData: {},
        filterState: {},
    }
}
export function timegrainDefaultValue(
    desc: TimegrainNativeFilterDesc
): TimegrainNativeFilter {
    return {
        id: desc.id,
        extraFormData: deepClone(desc.defaultDataMask.extraFormData),
        filterState: deepClone(desc.defaultDataMask.filterState),
        ownState: {},
    }
}

// not tested
export function timecolumnWithValue(
    desc: TimecolumnNativeFilterDesc,
    filter: TimecolumnNativeFilter,
    columnName: string,
): TimecolumnNativeFilter {
    return {
        ...filter,
        extraFormData: { granularity_sqla: columnName },
        filterState: { value: [columnName] },
    }
}
export function timecolumnWithNoValue(
    desc: TimecolumnNativeFilterDesc,
    filter: TimecolumnNativeFilter,
): TimecolumnNativeFilter {
    return {
        ...filter,
        extraFormData: {},
        filterState: {},
    }
}
export function timecolumnDefaultValue(
    desc: TimecolumnNativeFilterDesc
): TimecolumnNativeFilter {
    return {
        id: desc.id,
        extraFormData: deepClone(desc.defaultDataMask.extraFormData),
        filterState: deepClone(desc.defaultDataMask.filterState),
        ownState: {},
    }
}

export type BaseNativeFilter = {
    id: string
}

export type SelectNativeFilter = {
    extraFormData: SelectExtraFormData
    filterState: SelectFilterState | {}
    ownState: {}
} & BaseNativeFilter

export type TimeNativeFilter = {
    extraFormData: TimeExtraFormData
    filterState: TimeFilterState | {}
    ownState: {}
} & BaseNativeFilter

export type RangeNativeFilter = {
    extraFormData: RangeExtraFormData
    filterState: RangeFilterState | {}
    ownState: {}
} & BaseNativeFilter

export type TimegrainNativeFilter = {
    extraFormData: TimegrainExtraFormData
    filterState: TimegrainFilterState | {}
    ownState: {}
} & BaseNativeFilter

export type TimecolumnNativeFilter = {
    extraFormData: TimecolumnExtraFormData
    filterState: TimecolumnFilterState | {}
    ownState: {}
} & BaseNativeFilter

export type NativeFilter = SelectNativeFilter | TimeNativeFilter | RangeNativeFilter
    | TimegrainNativeFilter | TimecolumnNativeFilter

// NOTE: desc.controlValues.enableEmptyFilter === required. Why meaning is opposite?

// superset: superset-frontend/src/explore/components/controls/DateFilterControl/utils/constants.ts
export const timeFilterValues = {
    // Common
    lastDay: 'Last day',
    lastWeek: 'Last week',
    lastMonth: 'Last month',
    lastQuarter: 'Last quarter',
    lastYear: 'Last year',

    // Calendar
    previousCalendarWeek: 'previous calendar week',
    previousCalendarMonth: 'previous calendar month',
    previousCalendarQuarter: 'previous calendar quarter',
    previousCalendarYear: 'previous calendar year',

    // Current
    currentDay: 'Current day',
    currentWeek: 'Current week',
    currentMonth: 'Current month',
    currentYear: 'Current year',
    currentQuarter: 'Current quarter',

    // Custom & Advanced
    // '2020-01-23T18:41:12 : 2020-01-24T00:00:00'
    // Or even 'DATEADD(DATETIME(\"2025-04-28T00:00:00\"), -7, day) : 2025-04-28T00:00:00'

    // No filter
    // undefined
} as const
export type TimeFilterValues = typeof timeFilterValues[keyof typeof timeFilterValues]

// superset/constants.py
export const timegrainFilterValues = {
    second: "PT1S",
    fiveSeconds: "PT5S",
    thirtySeconds: "PT30S",
    minute: "PT1M",
    fiveMinutes: "PT5M",
    tenMinutes: "PT10M",
    fifteenMinutes: "PT15M",
    thirtyMinutes: "PT30M",
    halfHour: "PT0.5H",
    hour: "PT1H",
    sixHours: "PT6H",
    day: "P1D",
    week: "P1W",
    weekStartingSunday: "1969-12-28T00:00:00Z/P1W",
    weekStartingMonday: "1969-12-29T00:00:00Z/P1W",
    weekEndingSaturday: "P1W/1970-01-03T00:00:00Z",
    weekEndingSunday: "P1W/1970-01-04T00:00:00Z",
    month: "P1M",
    quarter: "P3M",
    quarterYear: "P0.25Y",
    year: "P1Y",
    seconD:"Second",
}
export type TimegrainFilterValues = typeof timegrainFilterValues[keyof typeof timegrainFilterValues]

// range filter values
// [number | null, number | null]
