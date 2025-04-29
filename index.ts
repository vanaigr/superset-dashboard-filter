import * as F from './filters'

const dashboard = '11'

const ctx = await F.logIn('http://localhost:8089', 'admin', 'admin')
const filtersDesc = await F.getDashboardFiltersDesc(ctx, dashboard)
const filters = F.mkFilters(filtersDesc)

// select filter
if(false) {
    const desc = filtersDesc.find(it => it.name === 'Country')! as F.SelectNativeFilterDesc
    filters[desc.id] = F.selectWithIncludedValue(desc, filters[desc.id] as F.SelectNativeFilter, ['Austria', 'Japan'])
}

// time range filter
if(false) {
    const desc = filtersDesc.find(it => it.name === 'Time Range')! as F.TimeNativeFilterDesc
    //filters[desc.id] = F.timeWithBuiltinValue(desc, filters[desc.id] as F.TimeNativeFilter, F.timeFilterValues.lastDay)
    filters[desc.id] = F.timeWithDateRange(
        desc,
        filters[desc.id] as F.TimeNativeFilter,
        new Date('2003-10-03T00:00:00Z'), // NOTE: dates are accepted in UTC
        new Date('2004-06-28T00:00:00Z'),
    )
}

// numeric range filter
if(false) {
    const desc = filtersDesc.find(it => it.name === 'Order Quantity')! as F.RangeNativeFilterDesc
    filters[desc.id] = F.rangeWithBounds(
        desc,
        filters[desc.id] as F.RangeNativeFilter,
        30,
        40
    )
}

// time grain
{
    const desc = filtersDesc.find(it => it.name === 'Time Grain')! as F.TimegrainNativeFilterDesc
    filters[desc.id] = F.timegrainWithValue(
        desc,
        filters[desc.id] as F.TimegrainNativeFilter,
        F.timegrainFilterValues.weekEndingSaturday,
    )
}

const url = await F.genFiltersUrl(ctx, dashboard, filters)
console.log('done', url)
