
const DB="https://testfirebase-872d3-default-rtdb.firebaseio.com";
const DOMAIN="https://webora-lovat.vercel.app";

const esc=s=>String(s).replace(/[&<>"']/g,c=>({
 "&":"&amp;",
 "<":"&lt;",
 ">":"&gt;",
 '"':"&quot;",
 "'":"&apos;"
}[c]));

module.exports=async(req,res)=>{
 try{
  const r=await fetch(`${DB}/sites.json?shallow=true`);

  if(!r.ok){
   return res.status(502).send("Could not load website list");
  }

  const sites=await r.json();
  const urls=[`<url><loc>${DOMAIN}/</loc></url>`];

  if(sites&&typeof sites==="object"){
   for(const u of Object.keys(sites)){
    if(
     /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(u)&&
     !["api","sitemap","robots","favicon","_vercel"].includes(u)
    ){
     urls.push(
      `<url><loc>${esc(DOMAIN+"/"+encodeURIComponent(u))}</loc></url>`
     );
    }
   }
  }

  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  res.setHeader("Content-Type","application/xml; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=300, stale-while-revalidate=600");

  return res.status(200).send(xml);

 }catch(e){
  console.error(e);
  return res.status(500).send("Sitemap generation failed");
 }
};
