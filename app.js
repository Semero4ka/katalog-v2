const DB_NAME='catalogPWA', DB_VERSION=1;
let db, products=[], cart={}, orders=[], settings={supplier:'',buyer:''}, currentView='catalog', toastTimer, selectedCategory='Все категории';
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(Number(n)||0);
const fmtQty=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(Number(n)||0);
const norm=s=>String(s||'').toLowerCase().replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim().replace(/,\s*(шт|штук|кг|г|гр|л|упак\.?|уп|мешок|бл|бут|кор|пач|бан|ящ|рул|пакет)\s*$/i,'').replace(/[\s,.;]+$/,'');
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('products',{keyPath:'id'});d.createObjectStore('state',{keyPath:'key'});d.createObjectStore('orders',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function all(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function get(store,key){return new Promise((res,rej)=>{const r=tx(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(store,obj){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(obj);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function del(store,key){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function saveState(key,value){return put('state',{key,value})}
async function loadState(key,def){const o=await get('state',key);return o?o.value:def}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
async function init(){
 db=await openDB();
 const existing=await all('products');
 // Load the refreshed seed every launch so existing installations receive category metadata too.
 const r=await fetch('./catalog.json');const seed=await r.json();
 if(!existing.length){const t=db.transaction('products','readwrite');seed.forEach(p=>t.objectStore('products').put(p));await new Promise((res,rej)=>{t.oncomplete=res;t.onerror=rej;});}
 else{
  const seedById=new Map(seed.map(p=>[p.id,p]));
  const headings=new Set(['ЯЯ','БАКАЛЕЯ','БАТОНЧИКИ','БЫТОВЫЕ ТОВАРЫ','ВОДА','ЖЕВАТЕЛЬНАЯ РЕЗИНКА','ЗАЖИГАЛКИ','ЗАМОРОЗКА','ЗЕФИР','КАША,СУП,МИВИНА','КИНДЕР','КОЛБАСКИ','КОНДИТЕРСКИЕ ИЗДЕЛИЯ','КОНФЕТЫ В КОРОБКАХ','КОНФЕТЫ ВЕСОВЫЕ','КОРМ','КОФЕ','КРУПЫ ВЕСОВЫЕ','КРУПЫ ФАСОВКА','КУКУРУЗНЫЕ ПАЛОЧКИ','ЛЕДЕНЦЫ','ЛЕТО','МАЙОНЕЗ,КЕТЧУП,СОУС','МАКАРОНЫ','МОЛОЧНЫЕ ПРОДУКТЫ','МОРОЖЕНОЕ','НАША ФАСОВКА','НОВОГОДНИЕ ИГРУШКИ','НОВОГОДНИЕ ПОДАРКИ','НОВЫЙ ГОД','ПАКЕТЫ','ПАСХА','ПЕЧЕНЬЕ','ПЕЧЕНЬЕ В КОРРЕКСАХ','ПЕЧЕНЬЕ ВЕСОВОЕ','ПИВО','ПРЕСЕРВА','ПРИПРАВЫ','СМЕСЬ ПРИПРАВ','РАСТИТЕЛЬНОЕ МАСЛО','РЫБА','РЫБА К ПИВУ','РЫБНЫЕ КОНСЕРВЫ','СОКИ','СОЛЕНЬЯ','СУХИЕ ЗАВТРАКИ','СЫР ВЕСОВОЙ','ТОППИНГИ И СИРОПЫ','ХОТ ДОГ','ЧАЙ','ЧИПСЫ,СУХАРИКИ,ОРЕШКИ','ШОКОЛАД','ЭНЕРГЕТИКИ','ЯНЕНУЖНОЕ','ЯШКИНО']);
  for(const p of existing){const seeded=seedById.get(p.id);if(seeded){p.category=seeded.category;await put('products',p)}else if(headings.has(String(p.name||'').trim().toUpperCase())){await del('products',p.id)}else if(!p.category){p.category='Без категории';await put('products',p)}}
 }
 products=await all('products');cart=await loadState('cart',{});orders=await all('orders');settings=await loadState('settings',{supplier:'',buyer:''});
 $('#supplier').value=settings.supplier||'';$('#buyer').value=settings.buyer||'';
 renderAll();
 if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
function available(p){return p.stockTotal===null||p.stockTotal===undefined?null:Number(p.stockTotal)-reservedFor(p.id)}
function reservedFor(id){let n=Number(cart[id]||0);for(const o of orders){if(o.reserves!==false){for(const it of o.items||[])if(it.productId===id)n+=Number(it.qty||0)}}return n}
function productById(id){return products.find(p=>p.id===id)}
function totalCart(){return Object.entries(cart).reduce((sum,[id,q])=>sum+(Number(productById(id)?.price)||0)*Number(q),0)}
function qtyCart(){return Object.values(cart).reduce((a,b)=>a+Number(b||0),0)}
function renderAll(){renderCatalog();renderCart();renderOrders();$('#cartBadge').textContent=qtyCart();$('#productCount').textContent=`${products.length.toLocaleString('ru-RU')} позиций`;}
function showView(v){currentView=v;document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));$('#view-'+v).classList.remove('hidden');document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(v==='cart')renderCart();if(v==='orders')renderOrders();}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
function renderCatalog(){
 const q=$('#search').value.trim().toLowerCase(), cq=$('#categorySearch').value.trim().toLowerCase(), sf=$('#stockFilter').value, sort=$('#sort').value;
 const categories=[...new Set(products.map(p=>p.category||'Без категории'))];
 if(selectedCategory!=='Все категории'&&!categories.includes(selectedCategory))selectedCategory='Все категории';
 const inCategory=selectedCategory!=='Все категории'&&!q;
 const categorySearchWrap=$('#categorySearchWrap');
 categorySearchWrap.classList.toggle('hidden',!inCategory);
 $('#categorySearchLabel').textContent=`Поиск в категории «${selectedCategory}»`;
 $('#categorySearch').placeholder=`Найти товар в категории «${selectedCategory}»…`;
 const nav=$('#categoryNav');nav.innerHTML='';
 const makeChip=(label,active)=>{const b=document.createElement('button');b.type='button';b.className='category-chip'+(active?' active':'');b.textContent=label;b.setAttribute('aria-pressed',active?'true':'false');b.addEventListener('click',()=>{selectedCategory=label;$('#categorySearch').value='';$('#search').value='';renderCatalog();});nav.append(b)};
 makeChip('Все категории',selectedCategory==='Все категории');
 categories.forEach(c=>makeChip(c,selectedCategory===c));
 let arr=products.filter(p=>!q||p.name.toLowerCase().includes(q));
 if(!q&&selectedCategory!=='Все категории')arr=arr.filter(p=>(p.category||'Без категории')===selectedCategory);
 if(inCategory&&cq)arr=arr.filter(p=>p.name.toLowerCase().includes(cq));
 arr=arr.filter(p=>{const a=available(p);if(sf==='available')return a!==null&&a>0;if(sf==='unknown')return a===null;if(sf==='zero')return a!==null&&a<=0;return true});
 const cmp=(a,b)=>sort==='priceAsc'?(a.price??Infinity)-(b.price??Infinity):sort==='priceDesc'?(b.price??-Infinity)-(a.price??-Infinity):sort==='stock'?(available(b)??-Infinity)-(available(a)??-Infinity):a.name.localeCompare(b.name,'ru');
 const list=$('#catalogList');list.innerHTML='';$('#catalogEmpty').classList.toggle('hidden',arr.length>0);
 if(!arr.length)return;
 arr.sort((a,b)=>{
  if(q||inCategory)return cmp(a,b);
  const ca=categories.indexOf(a.category||'Без категории'),cb=categories.indexOf(b.category||'Без категории');
  return ca-cb||cmp(a,b);
 });
 arr.slice(0,1000).forEach(p=>{
  const a=available(p), row=document.createElement('div');row.className='product';
  const thumb=document.createElement('div');thumb.className='thumb';
  if(p.photo){const im=document.createElement('img');im.src=p.photo;im.alt=p.name;im.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:8px';thumb.append(im)}else thumb.textContent='Добавить фото';
  thumb.title='Нажмите, чтобы добавить или открыть фото';thumb.addEventListener('click',()=>photoAction(p));
  const info=document.createElement('div');info.innerHTML='<div class="pname"></div><div class="pmeta"></div>';info.querySelector('.pname').textContent=p.name;info.querySelector('.pmeta').textContent=`${p.category||'Без категории'} · Артикул: ${p.id}`;
  const price=document.createElement('div');price.className='price';price.textContent=p.price==null?'Цена не указана':money(p.price);
  const stock=document.createElement('div');stock.className='stock '+(a===null?'':a>0?'good':'zero');stock.textContent=a===null?'Остаток не указан':`Доступно: ${fmtQty(a)}`;
  const add=document.createElement('div');add.className='addrow';const inp=document.createElement('input');inp.type='number';inp.min='0.001';inp.step='any';inp.value='1';inp.className='qtyinput';inp.setAttribute('aria-label','Количество');
  const btn=document.createElement('button');btn.className='primary addbtn';btn.textContent='В корзину';btn.addEventListener('click',()=>addToCart(p.id,inp.value));
  add.append(inp,btn);row.append(thumb,info,price,stock,add);list.append(row);
 });
 if(arr.length>1000){const more=document.createElement('p');more.className='muted';more.textContent=`Показаны первые 1000 из ${arr.length} товаров. Уточните поиск или выберите категорию.`;list.append(more)}
}
async function addToCart(id,raw){const p=productById(id),q=Number(raw);if(!p||!Number.isFinite(q)||q<=0){toast('Укажите корректное количество');return}const a=available(p);if(a!==null&&q>a+1e-9){toast(`Недостаточно остатка. Доступно: ${fmtQty(Math.max(0,a))}`);return}cart[id]=Number(cart[id]||0)+q;await saveState('cart',cart);renderAll();toast('Товар добавлен; остаток зарезервирован');}
async function setCartQty(id,raw){const q=Number(raw),old=Number(cart[id]||0),p=productById(id);if(!p)return;if(!Number.isFinite(q)||q<=0){await removeCart(id);return}const a=available(p);const max=a===null?null:a+old;if(max!==null&&q>max){toast(`Доступно с учётом текущего резерва: ${fmtQty(max)}`);renderCart();return}cart[id]=q;await saveState('cart',cart);renderAll();}
async function removeCart(id){delete cart[id];await saveState('cart',cart);renderAll();toast('Товар удалён; резерв возвращён в доступный остаток')}
function renderCart(){const root=$('#cartList');root.innerHTML='';const entries=Object.entries(cart);if(!entries.length){root.innerHTML='<div class="empty">Корзина пока пуста. Добавьте товары из каталога.</div>';$('#cartSummary').innerHTML='';$('#makeOrder').disabled=true;return}$('#makeOrder').disabled=false;
 entries.forEach(([id,q])=>{const p=productById(id);if(!p)return;const row=document.createElement('div');row.className='cartrow';const name=document.createElement('div');name.innerHTML='<div class="name"></div><div class="muted"></div>';name.querySelector('.name').textContent=p.name;name.querySelector('.muted').textContent=available(p)===null?'Остаток не указан':`После резерва доступно: ${fmtQty(available(p))}`;
 const qty=document.createElement('input');qty.type='number';qty.min='.001';qty.step='any';qty.value=q;qty.title='Изменить количество';qty.addEventListener('change',()=>setCartQty(id,qty.value));
 const price=document.createElement('div');price.className='num';price.textContent=money(p.price);
 const sub=document.createElement('div');sub.className='num subtotal';sub.textContent=money((p.price||0)*q);
 const rem=document.createElement('button');rem.className='danger remove';rem.textContent='Удалить';rem.addEventListener('click',()=>removeCart(id));
 row.append(name,qty,price,sub,rem);root.append(row);
 });
 $('#cartSummary').innerHTML=`<div class="summaryline"><span>Позиций</span><strong>${entries.length}</strong></div><div class="summaryline"><span>Количество единиц</span><strong>${fmtQty(qtyCart())}</strong></div><div class="summaryline total"><span>Итого</span><span>${money(totalCart())}</span></div>`;
}
$('#clearCart').addEventListener('click',async()=>{if(!Object.keys(cart).length)return;if(!confirm('Удалить все товары из корзины и вернуть резерв в доступный остаток?'))return;cart={};await saveState('cart',cart);renderAll();toast('Корзина очищена')});
$('#makeOrder').addEventListener('click',async()=>{const items=Object.entries(cart).map(([id,qty])=>{const p=productById(id);return {productId:id,name:p?.name||'Товар',qty:Number(qty),price:Number(p?.price)||0}});if(!items.length)return;
 const order={id:'ORD-'+Date.now().toString().slice(-8),created:new Date().toISOString(),status:'Новый',reserves:true,items,supplier:settings.supplier||'',buyer:settings.buyer||'',invoice:{supplier:settings.supplier||'',buyer:settings.buyer||'',releasedBy:'',receivedBy:'',items:items.map(x=>({...x}))}};
 await put('orders',order);orders=await all('orders');cart={};await saveState('cart',cart);renderAll();showView('orders');openInvoice(order.id);toast('Заказ сохранён; резерв остался за заказом')});
function renderOrders(){const root=$('#ordersList');root.innerHTML='';if(!orders.length){root.innerHTML='<div class="empty">Заказов пока нет.</div>';return}orders.sort((a,b)=>b.created.localeCompare(a.created)).forEach(o=>{const card=document.createElement('article');card.className='order-card';const head=document.createElement('div');head.className='order-head';const left=document.createElement('div');left.innerHTML=`<div class="order-title">${o.id}</div><div class="order-meta">${new Date(o.created).toLocaleString('ru-RU')} · ${(o.items||[]).length} наименований</div>`;const right=document.createElement('div');right.innerHTML=`<span class="state ${o.status==='Завершён'?'done':''}">${o.status}</span> <strong>${money((o.invoice?.items||o.items||[]).reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.qty)||0),0))}</strong>`;head.append(left,right);const actions=document.createElement('div');actions.className='order-actions';
 const btn=(label,cls,fn)=>{const b=document.createElement('button');b.textContent=label;b.className=cls;b.addEventListener('click',fn);actions.append(b)};
 btn('Открыть накладную','primary',()=>openInvoice(o.id));btn(o.status==='Завершён'?'Вернуть в работу':'Завершить', 'secondary',()=>toggleOrder(o.id));btn('Удалить заказ','danger',()=>deleteOrder(o.id));
 card.append(head,actions);root.append(card)})}
async function toggleOrder(id){const o=orders.find(x=>x.id===id);if(!o)return;o.status=o.status==='Завершён'?'Новый':'Завершён';await put('orders',o);orders=await all('orders');renderOrders();toast('Статус заказа обновлён')}
async function deleteOrder(id){const o=orders.find(x=>x.id===id);if(!o)return;if(!confirm(`Удалить ${id}? Зарезервированное количество этого заказа будет освобождено.`))return;await del('orders',id);orders=await all('orders');renderAll();toast('Заказ удалён, резерв освобождён')}
function openModal(html){$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden');$('#modalContent').innerHTML=''}
$('#modal').addEventListener('click',e=>{if(e.target.dataset.close)closeModal()});
function openInvoice(id){const o=orders.find(x=>x.id===id);if(!o)return;if(!o.invoice)o.invoice={supplier:o.supplier||'',buyer:o.buyer||'',releasedBy:'',receivedBy:'',items:(o.items||[]).map(x=>({...x}))};const inv=o.invoice;
 openModal(`<div id="invoiceDoc">
 <div class="invoice-head"><h2>НАКЛАДНАЯ</h2><div class="muted">Заказ ${o.id} · ${new Date(o.created).toLocaleDateString('ru-RU')}</div></div>
 <div class="formgrid"><label>Поставщик<input id="invSupplier" value="${esc(inv.supplier||'')}"></label><label>Покупатель<input id="invBuyer" value="${esc(inv.buyer||'')}"></label></div>
 <div class="invoice-table-wrap"><table class="invoice-table" id="invoiceTable"><colgroup><col><col><col><col><col><col></colgroup><thead><tr><th>№<span class="col-resizer" data-col="0" title="Перетащите, чтобы изменить ширину"></span></th><th>Товар<span class="col-resizer" data-col="1" title="Перетащите, чтобы изменить ширину"></span></th><th>Количество<span class="col-resizer" data-col="2" title="Перетащите, чтобы изменить ширину"></span></th><th>Цена<span class="col-resizer" data-col="3" title="Перетащите, чтобы изменить ширину"></span></th><th>Сумма<span class="col-resizer" data-col="4" title="Перетащите, чтобы изменить ширину"></span></th><th class="no-print"> </th></tr></thead><tbody id="invRows"></tbody></table></div><p class="invoice-resize-help no-print">Ширину столбцов меняйте, перетаскивая границы в заголовках. Высоту строки — за нижний угол поля наименования. Настройки ширины сохраняются на этом устройстве.</p>
 <div class="invoice-total">Итого: <span id="invTotal">0,00 ₽</span></div><div class="invoice-note">В том числе НДС: 0</div>
 <div class="invoice-note">Всего наименований: <strong id="invCount"></strong>, на сумму <strong id="invTotalText"></strong></div>
 <div class="invoice-note"><strong id="invWords"></strong></div>
 <div class="invoice-signatures"><label>Кто отпустил товар<input id="invReleased" value="${esc(inv.releasedBy||'')}"></label><label>Кто получил<input id="invReceived" value="${esc(inv.receivedBy||'')}"></label></div>
 </div><div class="invoice-buttons"><button id="addInvRow" class="secondary">Добавить строку</button><button id="saveInvoice" class="primary">Сохранить накладную</button><button id="printInvoice" class="secondary">Печать / PDF</button><button id="shareInvoice" class="secondary">Поделиться текстом</button></div>`);
 const body=$('#invRows');(inv.items||[]).forEach(item=>addInvoiceRow(item));
 if(!(inv.items||[]).length)addInvoiceRow({productId:'',name:'',qty:1,price:0});
 setupInvoiceColumnResizing();
 $('#addInvRow').addEventListener('click',()=>addInvoiceRow({productId:'',name:'',qty:1,price:0}));
 $('#saveInvoice').addEventListener('click',async()=>{o.invoice={supplier:$('#invSupplier').value,buyer:$('#invBuyer').value,releasedBy:$('#invReleased').value,receivedBy:$('#invReceived').value,items:[...body.querySelectorAll('tr')].map(readInvoiceRow)};o.supplier=o.invoice.supplier;o.buyer=o.invoice.buyer;await put('orders',o);orders=await all('orders');settings.supplier=o.invoice.supplier;settings.buyer=o.invoice.buyer;await saveState('settings',settings);renderOrders();toast('Накладная сохранена');});
 $('#printInvoice').addEventListener('click',()=>{saveInvoiceQuiet(o).then(()=>{prepareInvoicePrint();window.print()})});
 $('#shareInvoice').addEventListener('click',async()=>{const text=invoiceText(o);if(navigator.share){try{await navigator.share({title:'Накладная '+o.id,text})}catch(e){}}else{await navigator.clipboard?.writeText(text);toast('Текст накладной скопирован, если браузер разрешил копирование')}});
 recalcInvoice();
}
function setupInvoiceColumnResizing(){
 const table=$('#invoiceTable');if(!table)return;
 const cols=[...table.querySelectorAll('colgroup col')];
 const defaults=[34,380,90,100,100,40],minima=[28,150,62,68,68,34];
 let widths=defaults.slice();
 try{const saved=JSON.parse(localStorage.getItem('invoiceColumnWidths')||'null');if(Array.isArray(saved)&&saved.length===cols.length)widths=saved.map((v,i)=>Math.max(minima[i],Math.min(900,Number(v)||defaults[i])))}catch{}
 const apply=()=>{cols.forEach((c,i)=>c.style.width=widths[i]+'px');const wrap=table.closest('.invoice-table-wrap');table.style.width=Math.max(wrap?.clientWidth||0,widths.reduce((a,b)=>a+b,0))+'px'};
 apply();
 table.querySelectorAll('.col-resizer').forEach(handle=>{handle.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const i=Number(handle.dataset.col),startX=e.clientX,startA=widths[i],startB=widths[i+1];if(!Number.isInteger(i)||i<0||i>=cols.length-1)return;handle.setPointerCapture?.(e.pointerId);const move=ev=>{const delta=ev.clientX-startX;let a=Math.max(minima[i],startA+delta),b=Math.max(minima[i+1],startB-(a-startA));if(b===minima[i+1]&&a-startA>startB-minima[i+1])a=startA+(startB-minima[i+1]);widths[i]=a;widths[i+1]=b;apply()};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);try{localStorage.setItem('invoiceColumnWidths',JSON.stringify(widths))}catch{}};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true})})});
 window.addEventListener('resize',apply,{once:true});
}
function addInvoiceRow(item){const body=$('#invRows'),tr=document.createElement('tr');tr.innerHTML=`<td class="idx"></td><td><div class="itemname-wrap"><textarea class="itemname" rows="2" aria-label="Полное наименование товара" spellcheck="false"></textarea><span class="itemname-print"></span></div></td><td><input class="qty right" type="number" step="any" min="0" aria-label="Количество"></td><td><input class="price right" type="number" step="any" min="0" aria-label="Цена"></td><td class="sum right">0,00</td><td class="no-print"><button class="danger rowdel">×</button></td>`;
 const nameField=tr.querySelector('.itemname');nameField.value=item.name||'';nameField.style.height='auto';requestAnimationFrame(()=>{nameField.style.height=Math.max(48,nameField.scrollHeight+2)+'px'});tr.querySelector('.qty').value=item.qty??1;tr.querySelector('.price').value=item.price??0;
 tr.querySelectorAll('input,textarea').forEach(inp=>inp.addEventListener('input',()=>{if(inp.classList.contains('itemname')&&inp.scrollHeight>inp.clientHeight){inp.style.height=Math.max(48,inp.scrollHeight+2)+'px'}recalcInvoice()}));tr.querySelector('.rowdel').addEventListener('click',()=>{tr.remove();recalcInvoice()});body.append(tr);recalcInvoice()}
function readInvoiceRow(tr){return {productId:'',name:tr.querySelector('.itemname').value,qty:Number(tr.querySelector('.qty').value)||0,price:Number(tr.querySelector('.price').value)||0}}
function recalcInvoice(){const rows=[...($('#invRows')?.querySelectorAll('tr')||[])];let total=0;rows.forEach((tr,i)=>{tr.querySelector('.idx').textContent=i+1;const q=Number(tr.querySelector('.qty').value)||0,p=Number(tr.querySelector('.price').value)||0,s=q*p;total+=s;tr.querySelector('.sum').textContent=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(s)});if($('#invTotal'))$('#invTotal').textContent=money(total);if($('#invCount'))$('#invCount').textContent=rows.filter(tr=>tr.querySelector('.itemname').value.trim()).length;if($('#invTotalText'))$('#invTotalText').textContent=money(total);if($('#invWords'))$('#invWords').textContent=numberWordsRub(total)}
async function saveInvoiceQuiet(o){o.invoice={supplier:$('#invSupplier').value,buyer:$('#invBuyer').value,releasedBy:$('#invReleased').value,receivedBy:$('#invReceived').value,items:[...$('#invRows').querySelectorAll('tr')].map(readInvoiceRow)};await put('orders',o);orders=await all('orders');}
function prepareInvoicePrint(){document.querySelectorAll('#invRows tr').forEach(tr=>{const input=tr.querySelector('.itemname'),span=tr.querySelector('.itemname-print');if(input&&span)span.textContent=input.value});document.body.classList.add('printing-invoice')}
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-invoice'));

function invoiceText(o){const i=o.invoice||{},items=i.items||o.items||[];let lines=[`НАКЛАДНАЯ ${o.id}`,`Поставщик: ${i.supplier||''}`,`Покупатель: ${i.buyer||''}`,'№ | Товар | Количество | Цена | Сумма'];items.forEach((x,n)=>lines.push(`${n+1} | ${x.name} | ${x.qty} | ${money(x.price)} | ${money(x.qty*x.price)}`));const total=items.reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.price)||0),0);lines.push(`Итого: ${money(total)}`,'В том числе НДС: 0',`Всего наименований: ${items.filter(x=>x.name).length}, на сумму ${money(total)}`,numberWordsRub(total),`Кто отпустил товар: ${i.releasedBy||''}`,`Кто получил: ${i.receivedBy||''}`);return lines.join('\\n')}
function numberWordsRub(amount){const n=Math.round((Number(amount)||0)*100),rub=Math.floor(n/100),kop=n%100;return `Итого: ${integerWords(rub)} ${rubDecl(rub)} ${String(kop).padStart(2,'0')} ${kopDecl(kop)}`.replace(/\\s+/g,' ').trim()}
function integerWords(n){if(n===0)return 'ноль';const onesM=['','один','два','три','четыре','пять','шесть','семь','восемь','девять'],onesF=['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'],teens=['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'],tens=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'],hundreds=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];function tri(v,f){let a=[];if(Math.floor(v/100))a.push(hundreds[Math.floor(v/100)]);let r=v%100;if(r>=10&&r<20)a.push(teens[r-10]);else{if(Math.floor(r/10))a.push(tens[Math.floor(r/10)]);let u=r%10;if(u)a.push((f?onesF:onesM)[u])}return a.join(' ')}let out=[];let mil=Math.floor(n/1e6),th=Math.floor(n/1000)%1000,rest=n%1000;if(mil)out.push(tri(mil,false),plural(mil,'миллион','миллиона','миллионов'));if(th)out.push(tri(th,true),plural(th,'тысяча','тысячи','тысяч'));if(rest)out.push(tri(rest,false));return out.join(' ')}
function plural(n,a,b,c){const x=n%100,y=n%10;return x>=11&&x<=14?c:y===1?a:y>=2&&y<=4?b:c}
function rubDecl(n){return plural(n,'рубль','рубля','рублей')}function kopDecl(n){return plural(n,'копейка','копейки','копеек')}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function photoAction(p){if(p.photo){openModal(`<h2>${esc(p.name)}</h2><img src="${p.photo}" alt="" style="display:block;max-width:100%;max-height:65vh;margin:auto"><div class="invoice-buttons"><button id="replacePhoto" class="primary">Заменить фото</button><button id="removePhoto" class="danger">Удалить фото</button></div>`);$('#replacePhoto').onclick=()=>pickPhoto(p);$('#removePhoto').onclick=async()=>{p.photo=null;await put('products',p);products=await all('products');closeModal();renderCatalog()};}else pickPhoto(p)}
function pickPhoto(p){const input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>6*1024*1024){toast('Фото больше 6 МБ. Выберите файл меньшего размера.');return}const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});p.photo=data;await put('products',p);products=await all('products');closeModal();renderCatalog();toast('Фото сохранено на этом устройстве')};input.click()}
$('#search').addEventListener('input',()=>{if($('#search').value.trim())selectedCategory='Все категории';renderCatalog()});$('#categorySearch').addEventListener('input',renderCatalog);$('#stockFilter').addEventListener('change',renderCatalog);$('#sort').addEventListener('change',renderCatalog);
$('#saveParties').addEventListener('click',async()=>{settings.supplier=$('#supplier').value;settings.buyer=$('#buyer').value;await saveState('settings',settings);toast('Реквизиты сохранены')});
function parseExcel(file,skipRows){return new Promise((resolve,reject)=>{if(!window.XLSX){reject(new Error('Библиотека Excel не загрузилась. Подключитесь к интернету и обновите страницу.'));return}const reader=new FileReader();reader.onload=e=>{try{let wb=XLSX.read(e.target.result,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});resolve(rows.slice(skipRows))}catch(err){reject(err)}};reader.onerror=reject;reader.readAsArrayBuffer(file)})}
const PRICE_CATEGORIES=new Set(['ЯЯ','БАКАЛЕЯ','БАТОНЧИКИ','БЫТОВЫЕ ТОВАРЫ','ВОДА','ЖЕВАТЕЛЬНАЯ РЕЗИНКА','ЗАЖИГАЛКИ','ЗАМОРОЗКА','ЗЕФИР','КАША,СУП,МИВИНА','КИНДЕР','КОЛБАСКИ','КОНДИТЕРСКИЕ ИЗДЕЛИЯ','КОНФЕТЫ В КОРОБКАХ','КОНФЕТЫ ВЕСОВЫЕ','КОРМ','КОФЕ','КРУПЫ ВЕСОВЫЕ','КРУПЫ ФАСОВКА','КУКУРУЗНЫЕ ПАЛОЧКИ','ЛЕДЕНЦЫ','ЛЕТО','МАЙОНЕЗ,КЕТЧУП,СОУС','МАКАРОНЫ','МОЛОЧНЫЕ ПРОДУКТЫ','МОРОЖЕНОЕ','НАША ФАСОВКА','НОВОГОДНИЕ ИГРУШКИ','НОВОГОДНИЕ ПОДАРКИ','НОВЫЙ ГОД','ПАКЕТЫ','ПАСХА','ПЕЧЕНЬЕ','ПЕЧЕНЬЕ В КОРРЕКСАХ','ПЕЧЕНЬЕ ВЕСОВОЕ','ПИВО','ПРЕСЕРВА','ПРИПРАВЫ','СМЕСЬ ПРИПРАВ','РАСТИТЕЛЬНОЕ МАСЛО','РЫБА','РЫБА К ПИВУ','РЫБНЫЕ КОНСЕРВЫ','СОКИ','СОЛЕНЬЯ','СУХИЕ ЗАВТРАКИ','СЫР ВЕСОВОЙ','ТОППИНГИ И СИРОПЫ','ХОТ ДОГ','ЧАЙ','ЧИПСЫ,СУХАРИКИ,ОРЕШКИ','ШОКОЛАД','ЭНЕРГЕТИКИ','ЯНЕНУЖНОЕ','ЯШКИНО']);
function priceKey(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[“”„”«»]/g,'').replace(/[–—−]/g,'-').replace(/,\s*(?:\d+\s*)?(?:шт|штук|кг|г|гр|л|упак\.?|уп|мешок|бл|бут|кор|пач|бан|ящ|рул|пакет)\.?\s*$/i,'').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim()}
function parsePriceValue(raw){if(raw===null||raw===undefined||String(raw).trim()==='')return null;if(typeof raw==='number')return Number.isFinite(raw)?raw:NaN;const cleaned=String(raw).replace(/[\s\u00a0]/g,'').replace(/[₽руб.]/gi,'').replace(',','.');const n=Number(cleaned);return Number.isFinite(n)?n:NaN}
function newProductId(prefix='p'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}
$('#importPrice').addEventListener('click',async()=>{
 const f=$('#priceImport').files[0];if(!f){toast('Сначала выберите файл прайс-листа');return}
 const btn=$('#importPrice');btn.disabled=true;btn.textContent='Импортируем…';$('#importStatus').textContent='Проверяем прайс-лист…';
 try{
  const rows=await parseExcel(f,4);let category='Без категории';const parsed=[];let namedRows=0,validPriceRows=0;
  for(const row of rows){const name=String(row?.[0]??'').trim().replace(/\s+/g,' ');if(!name||/^итого$/i.test(name))continue;const upper=name.toUpperCase();if(PRICE_CATEGORIES.has(upper)){category=upper==='ЯЯ'?'Без категории':upper;continue}const raw=row?.[1],price=parsePriceValue(raw);namedRows++;if(price===null||Number.isFinite(price))validPriceRows++;parsed.push({name,price,category,priceInvalid:Number.isNaN(price)})}
  if(namedRows<5||validPriceRows<5)throw new Error('Не удалось распознать структуру прайс-листа. Проверьте, что выбран Excel-файл с товарами и ценами, а не остатки или другой документ. Каталог не изменён.');
  // Index every existing product. Exact normalized names take priority; package-suffix variants are a fallback.
  const exactIndex=new Map(),looseIndex=new Map();
  const indexAdd=(map,key,p)=>{if(!key)return;const a=map.get(key)||[];a.push(p);map.set(key,a)};
  const reindex=()=>{exactIndex.clear();looseIndex.clear();for(const p of products){indexAdd(exactIndex,norm(p.name),p);indexAdd(looseIndex,priceKey(p.name),p)}};reindex();
  let updatedRows=0,updatedRecords=0,added=0,ambiguous=0,invalidPrice=0,blankPrice=0;const updatedIds=new Set();
  for(const item of parsed){if(item.priceInvalid){invalidPrice++;continue}if(item.price===null)blankPrice++;
   const exact=exactIndex.get(norm(item.name))||[];let matches=exact;
   if(!matches.length){const loose=looseIndex.get(priceKey(item.name))||[];const identities=new Set(loose.map(p=>norm(p.name)));if(identities.size>1){ambiguous++;continue}matches=loose}
   if(matches.length){for(const p of matches){p.price=item.price;p.category=item.category;p.norm=norm(p.name);await put('products',p);if(!updatedIds.has(p.id)){updatedIds.add(p.id);updatedRecords++}}updatedRows++;
   }else{
    // No matching product: add a new entry once. Never overwrite stock/photo/order data on existing records.
    const p={id:newProductId(),name:item.name,norm:norm(item.name),price:item.price,category:item.category,stockTotal:null,stockName:null,stockMatch:'not_found',photo:null};products.push(p);await put('products',p);indexAdd(exactIndex,norm(p.name),p);indexAdd(looseIndex,priceKey(p.name),p);added++;
   }
  }
  products=await all('products');renderAll();
  const unmatched=added+ambiguous;
  $('#importStatus').textContent=`Прайс «${f.name}» успешно обработан. Обновлено строк: ${updatedRows}; обновлено существующих записей: ${updatedRecords}; добавлено новых товаров: ${added}; без однозначного совпадения: ${unmatched}${ambiguous?` (неоднозначных строк пропущено: ${ambiguous})`:''}; строк с некорректной ценой пропущено: ${invalidPrice}; пустых цен: ${blankPrice}. Товары, которых нет в файле, не удалялись; остатки, фотографии и заказы сохранены.`;
  toast(`Прайс загружен: обновлено ${updatedRecords}, добавлено ${added}`);
 }catch(e){$('#importStatus').textContent='Импорт не выполнен: '+e.message;toast('Импорт не выполнен. Каталог не был намеренно очищен.')}finally{btn.disabled=false;btn.textContent='Импортировать цены'}
});
$('#importStock').addEventListener('click',async()=>{const f=$('#stockImport').files[0];if(!f){toast('Сначала выберите файл остатков');return}try{const rows=await parseExcel(f,3);let count=0,addedStock=0,unknown=0;for(const row of rows){const name=String(row[0]??'').trim().replace(/\s+/g,' ');if(!name||/^итого$/i.test(name)||/^магазин розница1$/i.test(name))continue;const raw=row[1],qty=raw===null||raw===''?null:Number(raw);let p=products.find(x=>norm(x.name)===norm(name)||norm(x.name)===norm(name.replace(/,\s*[^,]+$/,'')));if(!p){p=products.find(x=>norm(name).startsWith(norm(x.name))||norm(x.name).startsWith(norm(name)));}if(p){p.stockTotal=Number.isFinite(qty)?qty:null;p.stockName=name;p.stockMatch=p.stockTotal===null?'matched_unknown':'matched';count++;if(p.stockTotal===null)unknown++}else{products.push({id:'s-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name,norm:norm(name),price:null,stockTotal:Number.isFinite(qty)?qty:null,stockName:name,stockMatch:Number.isFinite(qty)?'matched':'matched_unknown',photo:null});addedStock++}await put('products',p)}products=await all('products');renderAll();$('#importStatus').textContent=`Остатки обработаны: обновлено ${count}, новых позиций из остатков ${addedStock}, без количества ${unknown}.`;toast('Импорт остатков завершён')}catch(e){$('#importStatus').textContent='Ошибка импорта: '+e.message;toast('Не удалось импортировать остатки')}});
$('#exportBackup').addEventListener('click',async()=>{const data={version:1,exportedAt:new Date().toISOString(),products:await all('products'),cart:await loadState('cart',{}),orders:await all('orders'),settings:await loadState('settings',{supplier:'',buyer:''})};const blob=new Blob([JSON.stringify(data)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='catalog-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);toast('Резервная копия подготовлена')});
$('#importBackup').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!data.products||!data.orders)throw new Error('Неверный формат файла');if(!confirm('Восстановление заменит текущий каталог, корзину и заказы. Продолжить?'))return;const t=db.transaction(['products','orders','state'],'readwrite');t.objectStore('products').clear();data.products.forEach(p=>t.objectStore('products').put(p));t.objectStore('orders').clear();data.orders.forEach(o=>t.objectStore('orders').put(o));t.objectStore('state').put({key:'cart',value:data.cart||{}});t.objectStore('state').put({key:'settings',value:data.settings||{supplier:'',buyer:''}});await new Promise((res,rej)=>{t.oncomplete=res;t.onerror=rej});products=await all('products');orders=await all('orders');cart=data.cart||{};settings=data.settings||{supplier:'',buyer:''};$('#supplier').value=settings.supplier||'';$('#buyer').value=settings.buyer||'';renderAll();toast('Резервная копия восстановлена')}catch(err){toast('Ошибка восстановления: '+err.message)}e.target.value=''});
init().catch(e=>{console.error(e);$('#productCount').textContent='Ошибка загрузки';toast('Не удалось открыть каталог. Попробуйте обновить страницу.')});
