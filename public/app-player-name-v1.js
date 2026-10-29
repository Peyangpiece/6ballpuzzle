/* Player names shown to other players (online matches, the rating ranking).
 *
 * HexPlayerName.check(raw) cleans a nickname the player typed and says whether
 * it may be used; HexPlayerName.display(raw) is used for names that come from
 * the network, so a name written by a modified client still never shows an
 * offensive word (it falls back to "Player").
 *
 * Matching runs on a normalised form: NFKC (full-width and half-width letters
 * become plain ones), lower case, katakana as hiragana, common digit and symbol
 * stand-ins as letters (5h1t, @ss), and spaces, punctuation and symbols removed
 * (f.u.c.k, ち ん こ). Words that are also part of ordinary words (grape,
 * peacock, Sussex) are only refused when they are the whole name.
 */
const HexPlayerName=(function(){
"use strict";
const MAX=12;
const FALLBACK="Player";
const LEET={"0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","@":"a","$":"s","!":"i","|":"i"};
// Refused anywhere in the name.
const ANYWHERE=[
    "fuck","fuk","shit","cunt","nigger","nigga","faggot","retard","bitch","whore","slut",
    "asshole","pussy","penis","vagina","porn","hitler","nazi","rapist","suicide",
    "http","www","admin","official","moderator",
    "ちんこ","ちんぽ","まんこ","せっくす","ぺにす","れいぷ","ふぇら","おっぱい","やりまん","やりちん",
    "ころす","ころせ","しねよ","死ね","氏ね","殺す","殺せ","強姦","売春","援交",
    "きちがい","基地外","がいじ","池沼","ばいた","運営","公式"
];
// Refused only as the whole name.
const WHOLE=["rape","cock","dick","sex","sexy","ass","fag","tits","cum","kys","しね","ちょん"];

function normalize(raw){
    let s=String(raw==null?"":raw).normalize("NFKC").toLowerCase();
    s=s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
    s=s.replace(/[013457@$!|]/g,c=>LEET[c]);
    return s.replace(/[\s\p{P}\p{S}\p{Cc}\p{Cf}]/gu,"");
}
function clean(raw){
    return String(raw==null?"":raw).replace(/[\p{Cc}\p{Cf}]/gu,"").replace(/\s+/g," ").trim().slice(0,MAX);
}
function isAllowed(name){
    const n=normalize(name);
    if(!n)return true;
    if(WHOLE.includes(n))return false;
    return !ANYWHERE.some(w=>n.includes(w));
}
function check(raw){
    const name=clean(raw);
    if(!name)return{ok:false,name:"",reason:"empty"};
    if(!isAllowed(name))return{ok:false,name,reason:"blocked"};
    return{ok:true,name,reason:""};
}
function display(raw){
    const name=String(raw==null?"":raw).replace(/[\p{Cc}\p{Cf}]/gu,"").replace(/\s+/g," ").trim().slice(0,24);
    return name&&isAllowed(name)?name:FALLBACK;
}
return{MAX,FALLBACK,normalize,clean,isAllowed,check,display};
})();
