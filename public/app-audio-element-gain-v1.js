/* Volume for <audio> elements where the browser ignores it.
 *
 * The battle BGM, the menu tap sound and the rotate sound are <audio>
 * elements whose volume follows the settings sliders. On iPhone and iPad an
 * element's volume is read-only (always 1), so those sliders changed nothing
 * and the BGM played at full volume. Where that is the case, each element is
 * played through a Web Audio gain node (on the same AudioContext as the
 * sound effects) the first time its volume is set, and `volume` reads and
 * writes that gain. Every existing `a.volume = …` keeps working unchanged.
 * Browsers whose element volume works are left alone.
 */
(function installAudioElementGain(){
    if(typeof window==="undefined"||window.__sixBallAudioElementGainInstalled)return;
    window.__sixBallAudioElementGainInstalled=true;
    const proto=typeof HTMLMediaElement!=="undefined"?HTMLMediaElement.prototype:null;
    const native=proto&&Object.getOwnPropertyDescriptor(proto,"volume");
    if(!native||!native.get||!native.set||typeof document==="undefined")return;

    let ignored=false;
    try{const probe=document.createElement("audio");native.set.call(probe,.5);ignored=Math.abs(native.get.call(probe)-.5)>.01;}catch(_){}
    window.__sixBallAudioElementVolumeIgnored=ignored;
    // The iOS app plays the BGM natively and the menu tap through Web Audio
    // (app-native-v1.js): a media element routed into Web Audio is silent
    // in its web view.
    if(window.__dropBallNativeAudio)return;
    if(!ignored&&!window.__sixBallForceAudioElementGain)return;

    const routes=new WeakMap();
    function audioContext(){
        if(typeof Sfx==="undefined")return null;
        if(!Sfx.ctx&&typeof Sfx.init==="function"){try{Sfx.init();}catch(_){}}
        return Sfx.ctx||null;
    }
    function route(el){
        let r=routes.get(el);
        if(r)return r;
        r={volume:1,gain:null};
        routes.set(el,r);
        const ctx=audioContext();
        if(!ctx||typeof ctx.createMediaElementSource!=="function")return r;
        try{
            const source=ctx.createMediaElementSource(el),gain=ctx.createGain();
            source.connect(gain);gain.connect(ctx.destination);
            r.gain=gain;
        }catch(_){}
        return r;
    }

    Object.defineProperty(proto,"volume",{
        configurable:true,
        enumerable:native.enumerable,
        get(){const r=routes.get(this);return r?r.volume:native.get.call(this);},
        set(v){
            const n=Number(v);
            if(!Number.isFinite(n)||n<0||n>1)return native.set.call(this,v);
            const r=route(this);
            r.volume=n;
            if(r.gain){
                try{r.gain.gain.cancelScheduledValues(r.gain.context.currentTime);r.gain.gain.setValueAtTime(n,r.gain.context.currentTime);}
                catch(_){r.gain.gain.value=n;}
            }else{
                try{native.set.call(this,n);}catch(_){}
            }
        }
    });

    // A routed element is heard only while the AudioContext runs; play() is
    // called from a tap, which is when a suspended context may be resumed.
    const basePlay=proto.play;
    proto.play=function(){
        const r=routes.get(this),ctx=r&&r.gain&&r.gain.context;
        if(ctx&&ctx.state!=="running"&&ctx.state!=="closed"){try{ctx.resume();}catch(_){}}
        return basePlay.apply(this,arguments);
    };

    window.__sixBallAudioElementGainVersion="audio-element-gain-v1";
})();
