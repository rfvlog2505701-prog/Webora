const DB = "https://testfirebase-872d3-default-rtdb.firebaseio.com";
const DOMAIN = "https://webora-lovat.vercel.app";

const esc = s => String(s).replace(/[&<>"']/g,c=>({
 "&":"&amp;",
 "<":"&lt;",
 ">":"&gt;",
 '"':"&quot;",
 "'":"&#39;"
}[c]));

function render(site,u){
 let h=String(site.html||"").trim()||"<html><head></head><body></body></html>";

 if(!/<html[\s>]/i.test(h)){
  h=`<!doctype html><html><head></head><body>${h}</body></html>`;
 }

 const title=String(site.title||u).slice(0,150);
 const desc=String(site.description||`Visit ${title}, published with Webora.`).slice(0,300);
 const url=DOMAIN+"/"+encodeURIComponent(u);

 const meta=`
 <title>${esc(title)}</title>
 <meta name="description" content="${esc(desc)}">
 <meta name="robots" content="index,follow">
 <link rel="canonical" href="${esc(url)}">
 <meta property="og:title" content="${esc(title)}">
 <meta property="og:description" content="${esc(desc)}">
 <meta property="og:url" content="${esc(url)}">
 <meta property="og:type" content="website">
 `;

 if(/<head[^>]*>/i.test(h)){
  h=h.replace(/<head[^>]*>/i,m=>m+meta);
 }else{
  h=h.replace(/<html[^>]*>/i,m=>m+`<head>${meta}</head>`);
 }

 const css=String(site.css||"").replace(/<\/style/gi,"<\\/style");
 const js=String(site.js||"").replace(/<\/script/gi,"<\\/script");

 if(css){
  h=h.replace(/<\/head>/i,`<style>${css}</style></head>`);
 }

 if(js){
  const tag=`<script>${js}</script>`;
  h=/<\/body>/i.test(h)
   ?h.replace(/<\/body>/i,tag+"</body>")
   :h+tag;
 }

 return "<!doctype html>"+h.replace(/^\s*<!doctype[^>]*>/i,"");
}

module.exports=async(req,res)=>{
 const u=String(req.query.username||"").toLowerCase();

 if(!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(u)||
 ["api","sitemap","robots","favicon","_vercel"].includes(u)){
  return res.status(404).send("Website not found");
 }

 try{
  const r=await fetch(`${DB}/sites/${encodeURIComponent(u)}.json`);

  if(!r.ok){
   return res.status(502).send("Database connection failed");
  }

  const s=await r.json();

  if(!s||!s.html){
   return res.status(404).send("Website not found");
  }

  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader(
   "Content-Security-Policy",
   "sandbox allow-scripts allow-forms allow-popups allow-modals"
  );
  res.setHeader("X-Robots-Tag","index, follow");
  res.setHeader("Cache-Control","public, s-maxage=60, stale-while-revalidate=300");

  return res.status(200).send(render(s,u));

 }catch(e){
  console.error(e);
  return res.status(500).send("Unable to load website");
 }
};
   
