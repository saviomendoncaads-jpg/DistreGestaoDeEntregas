import {describe,it,expect} from 'vitest';
import {buildCommercialReport,parseReportFilter,reportWindow,percentChange,type ReportOrder,type ReportItem,type ReportCatalog} from '../src/commercialAnalytics';
const filter=parseReportFilter({start:'2026-10-10',end:'2026-10-11'});
const order=(id:string,status='ENTREGUE',createdAt='2026-10-10T12:00:00Z',value:number|null=100,storeId='s1'):ReportOrder=>({id,status,createdAt,value,storeId,storeName:storeId,companyName:'Empresa',payment:'pix'});
const item=(orderId:string,price:number|null=10,quantity=2,productId='p1'):ReportItem=>({orderId,price,quantity,productId,name:productId});
const product=(storeId='s1',balance:number|null=10):ReportCatalog=>({storeId,storeName:storeId,productId:'p1',name:'Produto',sku:'sku',category:'Categoria',unit:'UN',active:true,balance,minimum:3});
const stores=[{id:'s1',name:'Loja 1',companyId:'c1',companyName:'Empresa'},{id:'s2',name:'Loja 2',companyId:'c1',companyName:'Empresa'}];
describe('Relatórios comerciais',()=>{
 it('exclui cancelados e devolvidos dos totais e do ranking, sem duplicar valor por item',()=>{
  const r=buildCommercialReport(filter,[order('a'),order('b','CANCELADO'),order('c','PRODUTO_RETORNADO_ESTOQUE')],[item('a'),item('a',5,1,'p2'),item('b'),item('c')],[product()],[],stores);
  expect(r.summary.value).toBe(100);expect(r.summary.orders).toBe(1);expect(r.summary.itemQuantity).toBe(3);expect(r.summary.knownItemValue).toBe(25);expect(r.summary.cancelled).toBe(1);expect(r.summary.returned).toBe(1);
 });
 it('separa pedidos válidos de entregues',()=>{
  const rows=[order('a'),order('b','EM_PREPARO')];
  expect(buildCommercialReport({...filter,basis:'delivered'},rows,[item('a'),item('b')],[product()],[],stores).summary.orders).toBe(1);
  expect(buildCommercialReport(filter,rows,[],[],[],stores).summary.pending).toBe(1);
 });
 it('não estima preço antigo nem ticket sem valor registrado',()=>{
  const r=buildCommercialReport(filter,[order('a','ENTREGUE',undefined,null),order('b')],[item('a',null),item('b',10)],[product()],[],stores);
  expect(r.summary.ticket).toBe(100);expect(r.quality.ordersWithoutValue).toBe(1);expect(r.quality.missingPrices).toBe(1);expect(r.products[0].revenue).toBe(20);expect(r.products[0].abc).toBeNull();
 });
 it('expõe a cobertura dos pedidos sem identificação de produto',()=>{
  const r=buildCommercialReport(filter,[order('a'),order('b')],[item('a')],[product()],[],stores);
  expect(r.quality.ordersWithItems).toBe(1);expect(r.quality.ordersWithoutItems).toBe(1);
 });
 it('considera o início e fim do dia de Fortaleza e compara períodos iguais',()=>{
  const r=buildCommercialReport(filter,[order('before','ENTREGUE','2026-10-10T02:59:59Z'),order('start','ENTREGUE','2026-10-10T03:00:00Z'),order('end','ENTREGUE','2026-10-12T02:59:59Z'),order('after','ENTREGUE','2026-10-12T03:00:00Z')],[],[],[],stores);
  expect(r.summary.orders).toBe(2);expect(r.summary.previous.orders).toBe(1);expect(r.series.map(row=>row.orders)).toEqual([1,1]);expect(r.previousPeriod).toEqual({start:'2026-10-08',end:'2026-10-09'});
 });
 it('separa o mesmo produto nas diferentes lojas',()=>{
  const r=buildCommercialReport(filter,[order('a'),order('b','ENTREGUE',undefined,100,'s2')],[item('a'),item('b',10,5)],[product(),product('s2')],[],stores);
  expect(r.products).toHaveLength(2);expect(r.products.map(p=>p.quantity)).toEqual([5,2]);expect(r.stores.reduce((sum,s)=>sum+s.value,0)).toBe(r.summary.value);
 });
 it('preserva pedidos de lojas removidas na consolidação por loja',()=>{
  const r=buildCommercialReport(filter,[order('a','ENTREGUE',undefined,100,'removed')],[],[],[],stores);
  expect(r.stores.find(store=>store.id==='removed')?.value).toBe(100);expect(r.stores.reduce((sum,store)=>sum+store.value,0)).toBe(r.summary.value);
 });
 it('estornos e ajustes não são novas vendas, e saldo é atual',()=>{
  const r=buildCommercialReport(filter,[],[],[product('s1',3),product('s2',null)],[{storeId:'s1',productId:'p1',type:'VENDA',quantity:6},{storeId:'s1',productId:'p1',type:'ESTORNO',quantity:2},{storeId:'s1',productId:'p1',type:'AJUSTE',quantity:1}],stores);
  expect(r.inventory[0]).toMatchObject({balance:3,netSales:4,netOutflow:5,coverageDays:1.5,low:true});expect(r.quality.uncontrolledProducts).toBe(1);expect(r.inventory).toHaveLength(1);
 });
 it('não inventa comparação quando a base anterior é zero',()=>{expect(percentChange(10,0)).toBeNull();expect(percentChange(0,10)).toBe(-100);});
 it('usa apenas dias controlados para cobertura quando o estoque começou no período',()=>{
  const r=buildCommercialReport(filter,[],[],[{...product('s1',3),trackedSince:'2026-10-11T12:00:00Z'}],[{storeId:'s1',productId:'p1',type:'VENDA',quantity:4}],stores);
  expect(r.inventory[0].observedDays).toBe(1);expect(r.inventory[0].coverageDays).toBe(.75);
 });
 it('ordena ABC por valor e respeita os limites acumulados de 80/95%',()=>{
  const r=buildCommercialReport(filter,[order('a')],[item('a',80,1,'p1'),item('a',15,1,'p2'),item('a',5,1,'p3')],[product()],[],stores);
  expect(r.products.map(p=>p.abc)).toEqual(['A','B','C']);
 });
 it('não soma quantidade removida na separação novamente pelo movimento de estoque',()=>{
  const r=buildCommercialReport(filter,[order('a')],[item('a',10,1)],[product()],[{storeId:'s1',productId:'p1',type:'VENDA',quantity:3},{storeId:'s1',productId:'p1',type:'ESTORNO',quantity:2}],stores);
  expect(r.products[0].quantity).toBe(1);expect(r.inventory[0].netSales).toBe(1);
 });
 it('valida período, parâmetros repetidos e base',()=>{
  expect(()=>parseReportFilter({start:'2026-02-30',end:'2026-03-02'})).toThrow();expect(()=>parseReportFilter({start:'2025-01-01',end:'2026-10-11'})).toThrow();expect(()=>parseReportFilter({start:['2026-10-10']})).toThrow();expect(()=>parseReportFilter({basis:'paid'})).toThrow();expect(reportWindow(filter).days).toBe(2);
 });
});
