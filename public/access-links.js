import{token,setupNav,toast,avatar,responseJson}from"./shared.js";
setupNav("access");
const grid=document.querySelector("#users-grid");
const formatDate=value=>value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"";
function card(item){
  return`<article class="user-invite-card ${item.sent?"sent":"pending"}" data-card="${item.token}" data-sent="${item.sent}">
    <div class="invite-user">${avatar(item)}<div><b>${item.name}</b><span class="invite-status ${item.sent?"status-sent":"status-pending"}">${item.sent?"Mensagem enviada":"Mensagem não enviada"}</span></div></div>
    <div class="invite-card-footer"><small>${item.sent?`Enviada em ${formatDate(item.sentAt)}`:"Aguardando envio"}</small><button class="bitrix-send" data-recipient="${item.token}" data-name="${item.name}" ${!item.canMessage?"disabled":""}>${item.sent?"Reenviar mensagem":"Enviar mensagem"}</button></div>
  </article>`;
}
function metrics(items){document.querySelector("#links-count").textContent=items.length;document.querySelector("#sent-count").textContent=items.filter(x=>x.sent).length;document.querySelector("#pending-count").textContent=items.filter(x=>!x.sent).length}
fetch(`/api/access-links?token=${encodeURIComponent(token)}`).then(async response=>{
  const data=await responseJson(response);if(!response.ok)throw new Error(data.error);metrics(data.links);grid.innerHTML=data.links.map(card).join("");
}).catch(error=>grid.innerHTML=`<div class="empty">${error.message}</div>`);
grid.addEventListener("click",async event=>{
  const send=event.target.closest("[data-recipient]");if(!send)return;
  if(!confirm(`Enviar a mensagem individual para ${send.dataset.name} pelo chat do Bitrix?`))return;
  send.disabled=true;send.textContent="Enviando...";
  const response=await fetch(`/api/send-bitrix-invite?token=${encodeURIComponent(token)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipientToken:send.dataset.recipient,baseUrl:location.origin})});
  const data=await responseJson(response);
  if(!response.ok){send.disabled=false;send.textContent="Enviar mensagem";return toast(data.error)}
  const cardEl=send.closest("[data-card]"),wasSent=cardEl.dataset.sent==="true";cardEl.dataset.sent="true";cardEl.classList.remove("pending");cardEl.classList.add("sent");cardEl.querySelector(".invite-status").className="invite-status status-sent";cardEl.querySelector(".invite-status").textContent="Mensagem enviada";cardEl.querySelector("small").textContent=`Enviada em ${formatDate(data.sentAt)}`;send.disabled=false;send.textContent="Reenviar mensagem";
  if(!wasSent){document.querySelector("#sent-count").textContent=Number(document.querySelector("#sent-count").textContent)+1;document.querySelector("#pending-count").textContent=Math.max(0,Number(document.querySelector("#pending-count").textContent)-1)}toast(`Mensagem enviada para ${data.name}.`);
});
