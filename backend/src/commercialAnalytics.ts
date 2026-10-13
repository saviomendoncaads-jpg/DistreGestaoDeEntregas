export interface ReportFilter { start: string; end: string; companyId: string; storeId: string; basis: 'valid' | 'delivered' }
export interface ReportOrder { id: string; storeId: string; storeName: string; companyName: string; createdAt: string; status: string; value: number | null; payment: string | null; linkIssue?: boolean }
export interface ReportItem { orderId: string; productId: string; name: string; quantity: number; price: number | null }
export interface ReportCatalog { storeId: string; storeName: string; productId: string; name: string; sku: string; category: string; unit: string; active: boolean; balance: number | null; minimum: number | null; trackedSince?: string | null }
export interface ReportMovement { storeId: string; productId: string; type: string; quantity: number }
export interface ReportStore { id: string; name: string; companyId: string; companyName: string }
const DAY = 86400000;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: number | null) => value == null ? 0 : Math.round(value * 100);
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' });
export const localDay = (date: Date) => dayFormatter.format(date);
const dateMillis = (value: string) => new Date(`${value}T03:00:00.000Z`).getTime();
const dayAt = (value: number) => localDay(new Date(value));
export function parseReportFilter(query: Record<string, unknown>, now = new Date()): ReportFilter {
  const text = (key: string, fallback = '') => {
    const value = query[key] ?? fallback;
    if (typeof value !== 'string' || value.length > 100) throw Error('Filtro inválido.');
    return value;
  };
  const end = text('end', localDay(now));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(dateMillis(end)) || dayAt(dateMillis(end)) !== end) throw Error('Informe datas válidas.');
  const start = text('start', dayAt(dateMillis(end) - 29 * DAY));
  for (const value of [start, end]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(dateMillis(value)) || dayAt(dateMillis(value)) !== value) throw Error('Informe datas válidas.');
  }
  const days = (dateMillis(end) - dateMillis(start)) / DAY + 1;
  if (days < 1 || days > 366) throw Error('O período deve ter entre 1 e 366 dias.');
  const basis = text('basis', 'valid');
  if (basis !== 'valid' && basis !== 'delivered') throw Error('Base de análise inválida.');
  return { start, end, companyId: text('companyId'), storeId: text('storeId'), basis };
}
export function reportWindow(filter: ReportFilter) {
  const start = dateMillis(filter.start), endExclusive = dateMillis(filter.end) + DAY;
  const days = (endExclusive - start) / DAY;
  return { start, endExclusive, previousStart: start - days * DAY, days, previousStartDay: dayAt(start - days * DAY), previousEndDay: dayAt(start - DAY) };
}
export const percentChange = (current: number, previous: number) => previous > 0 ? round((current - previous) / previous * 100) : null;
const excluded = new Set(['CANCELADO', 'PRODUTO_RETORNADO_ESTOQUE']);
const selected = (order: ReportOrder, basis: ReportFilter['basis']) => !excluded.has(order.status) && (basis === 'valid' || order.status === 'ENTREGUE');
export function buildCommercialReport(filter: ReportFilter, orders: ReportOrder[], items: ReportItem[], catalog: ReportCatalog[], movements: ReportMovement[], stores: ReportStore[]) {
  const window = reportWindow(filter);
  const inCurrent = (order: ReportOrder) => { const date = Date.parse(order.createdAt); return date >= window.start && date < window.endExclusive; };
  const currentAll = orders.filter(inCurrent);
  const previousAll = orders.filter(order => { const date = Date.parse(order.createdAt); return date >= window.previousStart && date < window.start; });
  const current = currentAll.filter(order => selected(order, filter.basis));
  const previous = previousAll.filter(order => selected(order, filter.basis));
  const metrics = (rows: ReportOrder[]) => {
    const valued = rows.filter(order => order.value != null);
    const value = valued.reduce((sum, order) => sum + money(order.value), 0) / 100;
    return { orders: rows.length, value: round(value), valuedOrders: valued.length, ticket: valued.length ? round(value / valued.length) : null };
  };
  const summary = metrics(current), previousSummary = metrics(previous);
  const currentIds = new Map(current.map(order => [order.id, order]));
  const previousIds = new Map(previous.map(order => [order.id, order]));
  const catalogByKey = new Map(catalog.map(product => [`${product.storeId}:${product.productId}`, product]));
  const productMap = new Map<string, { key: string; productId: string; storeId: string; name: string; storeName: string; sku: string; category: string; unit: string; quantity: number; pricedQuantity: number; revenue: number; previousQuantity: number; missingPrices: number; orders: Set<string>; abc: 'A' | 'B' | 'C' | null; share: number | null }>();
  const ordersWithItems = new Set<string>();
  let lineCount = 0, missingPrices = 0;
  for (const item of items) {
    const order = currentIds.get(item.orderId) ?? previousIds.get(item.orderId);
    if (!order) continue;
    const isCurrent = currentIds.has(item.orderId);
    const key = `${order.storeId}:${item.productId}`;
    const product = catalogByKey.get(key);
    const result = productMap.get(key) ?? { key, productId: item.productId, storeId: order.storeId, name: item.name, storeName: order.storeName, sku: product?.sku || item.productId, category: product?.category || 'Sem categoria', unit: product?.unit || 'Não informada', quantity: 0, pricedQuantity: 0, revenue: 0, previousQuantity: 0, missingPrices: 0, orders: new Set<string>(), abc: null, share: null };
    if (isCurrent) {
      result.quantity += item.quantity; result.orders.add(order.id); ordersWithItems.add(order.id); lineCount++;
      if (item.price == null) { result.missingPrices++; missingPrices++; }
      else { result.pricedQuantity += item.quantity; result.revenue += money(item.price) * item.quantity; }
    } else result.previousQuantity += item.quantity;
    productMap.set(key, result);
  }
  const products = [...productMap.values()].filter(product => product.quantity > 0).map(product => ({ ...product, orders: product.orders.size, revenue: round(product.revenue / 100), quantityChange: percentChange(product.quantity, product.previousQuantity) })).sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'pt-BR'));
  const abcProducts = products.filter(product => product.missingPrices === 0 && product.revenue > 0).sort((a,b) => b.revenue - a.revenue || a.key.localeCompare(b.key));
  const abcTotal = abcProducts.reduce((sum, product) => sum + money(product.revenue), 0);
  let cumulative = 0;
  for (const product of abcProducts) {
    product.abc = cumulative < .8 ? 'A' : cumulative < .95 ? 'B' : 'C';
    product.share = round(money(product.revenue) / abcTotal * 100);
    cumulative += money(product.revenue) / abcTotal;
  }
  const categoryMap = new Map<string, {name:string; quantity:number; revenue:number}>();
  for (const product of products) { const row = categoryMap.get(product.category) ?? {name:product.category,quantity:0,revenue:0}; row.quantity+=product.quantity; row.revenue+=money(product.revenue); categoryMap.set(row.name,row); }
  const categories = [...categoryMap.values()].map(row => ({...row,revenue:round(row.revenue/100)})).sort((a,b)=>b.revenue-a.revenue);
  const movementMap = new Map<string,{entries:number; sales:number; reversals:number; adjustments:number}>();
  for (const movement of movements) {
    const key = `${movement.storeId}:${movement.productId}`;
    const row = movementMap.get(key) ?? {entries:0,sales:0,reversals:0,adjustments:0};
    if (movement.type === 'ENTRADA') row.entries += movement.quantity;
    if (movement.type === 'VENDA') row.sales += movement.quantity;
    if (movement.type === 'ESTORNO') row.reversals += movement.quantity;
    if (movement.type === 'AJUSTE') row.adjustments += movement.quantity;
    movementMap.set(key,row);
  }
  const inventory = catalog.filter(product => product.balance != null).map(product => {
    const row = movementMap.get(`${product.storeId}:${product.productId}`) ?? {entries:0,sales:0,reversals:0,adjustments:0};
    const netSales = row.sales-row.reversals;
    const balance=product.balance!;
    const trackingStart=product.trackedSince?dateMillis(localDay(new Date(product.trackedSince))):window.start;
    const observedDays=Math.max(0,(window.endExclusive-Math.max(window.start,trackingStart))/DAY);
    return {...product,...row,balance,netSales,observedDays,netOutflow:netSales+row.adjustments,coverageDays:netSales>0&&observedDays>0?round(balance/(netSales/observedDays)):null,low:balance===0 || (product.minimum!=null && balance<=product.minimum),noSales:row.sales===0};
  }).sort((a,b)=>Number(b.low)-Number(a.low)||a.name.localeCompare(b.name,'pt-BR'));
  const storeCatalog=new Map(stores.map(store=>[store.id,store]));
  for(const order of [...currentAll,...previousAll])if(!storeCatalog.has(order.storeId))storeCatalog.set(order.storeId,{id:order.storeId,name:order.storeName,companyId:'',companyName:order.companyName});
  const scopedStores = [...storeCatalog.values()].filter(store => (!filter.companyId || store.companyId===filter.companyId) && (!filter.storeId || store.id===filter.storeId));
  const group = (rows:ReportOrder[], key:(order:ReportOrder)=>string) => {const groups=new Map<string,ReportOrder[]>();for(const order of rows){const name=key(order),list=groups.get(name)||[];list.push(order);groups.set(name,list);}return groups;};
  const currentStores=group(current,order=>order.storeId),previousStores=group(previous,order=>order.storeId),allStores=group(currentAll,order=>order.storeId);
  const storeRows = scopedStores.map(store => { const rows=currentStores.get(store.id)||[], past=previousStores.get(store.id)||[]; const totals=metrics(rows); return {...store,...totals,change:percentChange(totals.value,metrics(past).value),share:summary.value>0?round(totals.value/summary.value*100):null,cancelled:(allStores.get(store.id)||[]).filter(order=>order.status==='CANCELADO').length,delivered:rows.filter(order=>order.status==='ENTREGUE').length}; }).sort((a,b)=>b.value-a.value);
  const currentDays=group(current,order=>localDay(new Date(order.createdAt))),previousDays=group(previous,order=>localDay(new Date(order.createdAt)));
  const series = Array.from({length:window.days},(_,index)=> {const date=dayAt(window.start+index*DAY),comparisonDate=dayAt(window.previousStart+index*DAY); return {date,...metrics(currentDays.get(date)||[]),previousValue:metrics(previousDays.get(comparisonDate)||[]).value};});
  const groupOrders = (key: (order: ReportOrder)=>string) => [...group(current,key)].map(([name,rows])=>({name,...metrics(rows)})).sort((a,b)=>b.value-a.value);
  const soldKeys=new Set(products.map(product=>product.key));
  const unsoldProducts=catalog.filter(product=>product.active&&!soldKeys.has(`${product.storeId}:${product.productId}`)).map(product=>{const key=`${product.storeId}:${product.productId}`,previousQuantity=productMap.get(key)?.previousQuantity||0;return {...product,key,quantity:0,pricedQuantity:0,revenue:0,previousQuantity,missingPrices:0,orders:0,abc:null,share:null,quantityChange:percentChange(0,previousQuantity)};});
  return {filter,generatedAt:new Date().toISOString(),previousPeriod:{start:window.previousStartDay,end:window.previousEndDay},summary:{...summary,previous:previousSummary,valueChange:percentChange(summary.value,previousSummary.value),ordersChange:percentChange(summary.orders,previousSummary.orders),ticketChange:summary.ticket!=null&&previousSummary.ticket!=null?percentChange(summary.ticket,previousSummary.ticket):null,delivered:current.filter(order=>order.status==='ENTREGUE').length,pending:current.filter(order=>order.status!=='ENTREGUE').length,cancelled:currentAll.filter(order=>order.status==='CANCELADO').length,returned:currentAll.filter(order=>order.status==='PRODUTO_RETORNADO_ESTOQUE').length,totalRegistered:currentAll.length,itemQuantity:products.reduce((sum,product)=>sum+product.quantity,0),knownItemValue:round(products.reduce((sum,product)=>sum+money(product.revenue),0)/100)},quality:{linkIssues:currentAll.filter(order=>order.linkIssue).length,ordersWithItems:ordersWithItems.size,ordersWithoutItems:current.length-ordersWithItems.size,lineCount,missingPrices,ordersWithoutValue:current.length-summary.valuedOrders,abcProducts:abcProducts.length,uncontrolledProducts:catalog.filter(product=>product.balance==null).length},series,products,unsoldProducts,categories,inventory,stores:storeRows,payments:groupOrders(order=>order.payment||'Não informado'),statuses:groupOrders(order=>order.status),options:{stores,companies:[...new Map(stores.map(store=>[store.companyId,{id:store.companyId,name:store.companyName}])).values()]}};
}
export type CommercialReport = ReturnType<typeof buildCommercialReport>;
