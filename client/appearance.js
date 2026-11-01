// Только внешний вид. Этот файл не влияет на правила, комнаты и деньги.
export const APPEARANCE = {
  exposure: 1.0,
  ambient: 1.15,
  moonlight: 3.5,
  windowColor: '#a59272',
  windowGlow: .12,
  camera: [0, 30, 18],
  reducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false,
};
