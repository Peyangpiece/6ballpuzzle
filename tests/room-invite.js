// Room invitations (app-17.js / app-16.js): the LINE share link carries the
// code and a link back to the site, the iOS app links to the public site,
// and opening ?room=NNNNNN shows the room screen with the code filled in.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");
const app17 = read("app-17.js");
const start = app17.indexOf("const HEX_PUBLIC_ORIGIN"), end = app17.indexOf("// Host side of a private room");
assert(start > 0 && end > start, "invitation helpers present");
function load(protocol, native) {
  const opened = [];
  const ctx = { encodeURIComponent, location: { protocol, origin: protocol + "//dropball.example", href: "" } };
  ctx.window = { Capacitor: native ? { isNativePlatform: () => true } : undefined, open: url => { opened.push(url); return {}; } };
  vm.createContext(ctx);
  vm.runInContext(app17.slice(start, end) + "\nthis.f={hexRoomInviteText,hexShareOnLine};", ctx);
  return { ...ctx.f, opened, location: ctx.location };
}
const web = load("https:", false);
assert.strictEqual(web.hexRoomInviteText("123456"), "Drop Ballで対戦しよう！\nルームコード 123456\nhttps://dropball.example/?room=123456");
web.hexShareOnLine("123456");
assert.strictEqual(web.opened.length, 1);
assert(web.opened[0].startsWith("https://line.me/R/share?text="), "opens LINE's share page");
assert(decodeURIComponent(web.opened[0].split("text=")[1]).endsWith("/?room=123456"), "the shared text ends with the invitation link");
const app = load("capacitor:", true);
assert(app.hexRoomInviteText("654321").endsWith("https://dropball.hrk-6888.workers.dev/?room=654321"), "the iOS app links to the public site");
app.hexShareOnLine("654321");
assert.strictEqual(app.opened.length, 0, "the iOS app hands the link to the system once");
assert(app.location.href.startsWith("https://line.me/R/share?text="));
const app16 = read("app-16.js");
assert(app16.includes('setRoom(String(c));setScreen("FRIEND");') && app16.includes('open(q.get("room"))'), "?room= opens the room screen with the code");
assert(app16.includes("window.__hexOpenRoomInvite = open;") && app16.includes("window.__hexPendingRoomInvite"), "the app's universal-link handler can open the room screen");
// iOS app: a universal link (at launch or while running) opens the room screen.
const native = read("app-native-v1.js");
const ns = native.indexOf("const openInviteUrl="), ne = native.indexOf('call("App","getLaunchUrl")');
assert(ns > 0 && ne > ns, "universal-link handling present");
const ctx = { URL, window: {} };
vm.createContext(ctx);
vm.runInContext(native.slice(ns, native.indexOf("try{cap.addListener", ns)) + "\nthis.openInviteUrl=openInviteUrl;", ctx);
ctx.openInviteUrl("https://dropball.hrk-6888.workers.dev/?room=246810");
assert.strictEqual(ctx.window.__hexPendingRoomInvite, "246810", "a link before the menu mounts is kept");
const opened2 = [];
ctx.window.__hexOpenRoomInvite = c => opened2.push(c);
ctx.openInviteUrl("https://dropball.hrk-6888.workers.dev/?room=135791");
ctx.openInviteUrl("https://dropball.hrk-6888.workers.dev/?room=12ab56");
ctx.openInviteUrl("not a url");
assert.deepStrictEqual(opened2, ["135791"], "only six-digit codes open the room screen");
assert(native.includes('cap.addListener("App","appUrlOpen"'), "links while the app runs are handled");
assert(fs.readFileSync(path.join(__dirname, "..", "ios", "App", "App", "App.entitlements"), "utf8").includes("<string>applinks:dropball.hrk-6888.workers.dev</string>"), "Associated Domains names the site");
assert(require("../package.json").dependencies["@capacitor/app"], "@capacitor/app is a dependency");
assert(app16.includes('q.delete("room")') && app16.includes("history.replaceState"), "the parameter is removed after use");
assert(app17.includes('"data-hex-line-invite": "1"') && app17.includes('"LINEで招待"'), "the room host screen has the LINE button");
console.log("room invite PASS");
