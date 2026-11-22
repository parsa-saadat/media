/** A short melody made in the browser, so the "sample" track needs no audio file in the project. */
export function createDemoWav() {
  const rate = 22050;
  const notes = [
    [523.25, 0.42], [659.25, 0.42], [783.99, 0.42], [1046.5, 0.64], [783.99, 0.42], [659.25, 0.42], [523.25, 0.85],
  ];
  const samples = [];
  for (const [hz, seconds] of notes) {
    const count = Math.floor(rate * seconds);
    for (let i = 0; i < count; i++) {
      const t = i / rate;
      const envelope = Math.min(1, i / (rate * 0.025), (count - i) / (rate * 0.12));
      const value = 0.22 * envelope * (Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(2 * Math.PI * 2 * hz * t));
      samples.push(Math.max(-1, Math.min(1, value)));
    }
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => view.setInt16(44 + i * 2, Math.round(value * 32767), true));
  return new File([buffer], "voxsy-demo.wav", { type: "audio/wav" });
}
