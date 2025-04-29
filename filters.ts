import fetch, { type Response } from 'node-fetch';
/** @imort { NativeFilter } from './types.d.ts' */

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

export type ExtraFormDataV1 = {
    filters: Array<{
        col: string
        op: string
        val: string[]
    }>
}
export type ExtraFormDataV2 = {
    time_range?: string
}

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
        extraFormData: ExtraFormDataV1
        filterState: SelectFilterState
    }
    filterType: 'filter_select'
} & BaseNativeFilterDesc

export type TimeFilterState = {
    // ...
    value: TimeFilterValues | string
}
export type TimeNativeFilterDesc = {
    controlValues: {
        enableEmptyFilter: boolean
    }
    defaultDataMask: {
        extraFormData: ExtraFormDataV2
        filterState: TimeFilterState
    }
    filterType: 'filter_time'
} & BaseNativeFilterDesc

export type NativeFilterDesc = SelectNativeFilterDesc | TimeNativeFilterDesc
    | (BaseNativeFilterDesc & { filterType: Exclude<FilterType, 'filter_time' | 'filter_select'>  })


export function mkFilters(descs: NativeFilterDesc[]): Record<string, NativeFilter> {
    const res: Record<string, NativeFilter> = {}
    for(let i = 0; i < descs.length; i++) {
        const desc = descs[i]
        if(desc.filterType === 'filter_select') {
            res[desc.id] = {
                id: desc.id,
                extraFormData: deepClone(desc.defaultDataMask.extraFormData),
                filterState: deepClone(desc.defaultDataMask.filterState),
                ownState: {},
            } satisfies SelectNativeFilter
        }
        else if(desc.filterType === 'filter_time') {
            res[desc.id] = {
                id: desc.id,
                extraFormData: deepClone(desc.defaultDataMask.extraFormData),
                filterState: deepClone(desc.defaultDataMask.filterState),
                ownState: {},
            } satisfies TimeNativeFilter
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

export type BaseNativeFilter = {
    id: string
}

export type SelectNativeFilter = {
    extraFormData: ExtraFormDataV1
    filterState: SelectFilterState | {}
    ownState: {}
} & BaseNativeFilter

export type TimeNativeFilter = {
    extraFormData: ExtraFormDataV2
    filterState: TimeFilterState | {}
    ownState: {}
} & BaseNativeFilter

export type NativeFilter = SelectNativeFilter | TimeNativeFilter | BaseNativeFilter

// NOTE: desc.controlValues.enableEmptyFilter === required. Why meaning is opposite?

// superset: superset-frontend/src/explore/components/controls/DateFilterControl/utils/constants.ts
export const timeFilterValues = [
    // Common
    'Last day',
    'Last week',
    'Last month',
    'Last quarter',
    'Last year',

    // Calendar
    'previous calendar week',
    'previous calendar month',
    'previous calendar quarter',
    'previous calendar year',

    // Current
    'Current day',
    'Current week',
    'Current month',
    'Current year',
    'Current quarter',

    // Custom & Advanced
    // '2020-01-23T18:41:12 : 2020-01-24T00:00:00'
    // Or even 'DATEADD(DATETIME(\"2025-04-28T00:00:00\"), -7, day) : 2025-04-28T00:00:00'

    // No filter
    // undefined
] as const
export type TimeFilterValues = typeof timeFilterValues[number]

// range filter values
// [number | null, number | null]
