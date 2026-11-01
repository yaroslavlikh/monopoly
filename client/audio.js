let context;
export const audio={
  enabled:localStorage.getItem('kvartal.sound')!=='off',
  unlock(){try{context??=new (window.AudioContext||window.webkitAudioContext)();if(context.state==='suspended')context.resume();}catch{}},
  toggle(){this.enabled=!this.enabled;localStorage.setItem('kvartal.sound',this.enabled?'on':'off');if(this.enabled){this.unlock();this.play('click');}return this.enabled;},
  play(kind){if(!this.enabled||!context||context.state!=='running')return;const patterns={click:[540],roll:[160,230,180,320],purchase:[390,490,650],payment:[330,250],turn:[440,660],card:[330,440,550],win:[390,490,590,780],message:[650,840],error:[170,140]};
    (patterns[kind]||[400]).forEach((freq,i)=>{const o=context.createOscillator(),gain=context.createGain();o.type=kind==='roll'?'triangle':'sine';o.frequency.value=freq;gain.gain.setValueAtTime(0,context.currentTime+i*.07);gain.gain.linearRampToValueAtTime(.035,context.currentTime+i*.07+.01);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+i*.07+.13);o.connect(gain);gain.connect(context.destination);o.start(context.currentTime+i*.07);o.stop(context.currentTime+i*.07+.16);});
  },
};
