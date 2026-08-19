const fs=require("fs");
const assert=require("assert");

const manifest=JSON.parse(fs.readFileSync(`${__dirname}/../public/manifest.webmanifest`,`utf8`));
const html=fs.readFileSync(`${__dirname}/../public/index.html`,`utf8`);

assert.strictEqual(manifest.orientation,"landscape","PWA manifest must request landscape orientation");
assert(/id="orientationGate"/.test(html),"portrait orientation gate is missing");
assert(/__hexLandscapeGateVersion="landscape-start-v1"/.test(html),"landscape gate version marker is missing");
assert(/__hexLandscapeRequired=true/.test(html),"landscape-required marker is missing");
assert(/function hexIsLandscape\(\)\{return window\.innerWidth>=window\.innerHeight;\}/.test(html),"landscape viewport check is missing");
assert(/if\(window\.__hexdropMounted\|\|!hexIsLandscape\(\)\)return false;/.test(html),"mount is not blocked in portrait");
assert(/orientationchange/.test(html)&&/resize/.test(html),"orientation gate does not react to viewport rotation");
assert(/if\(landscape&&typeof window\.__tryMountHexdrop==="function"\)window\.__tryMountHexdrop\(\);/.test(html),"game does not auto-start after rotating to landscape");
assert(!/window\.__mountHexdrop\(\);var b=document\.getElementById\("boot"\)/.test(html),"legacy unconditional startup is still present");
assert(/端末を横向きにしてください/.test(html),"portrait guidance copy is missing");

console.log("landscape startup gate PASS",JSON.stringify({orientation:manifest.orientation,version:"landscape-start-v1"}));
