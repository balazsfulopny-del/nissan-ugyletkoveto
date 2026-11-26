import { jsPDF } from 'jspdf';

/** downscale a photo to max 2000 px JPEG so scans stay small */
export const shrinkImage = (f: Blob) => new Promise<{ url: string; w: number; h: number }>((ok, no) => {
  const u = URL.createObjectURL(f); const im = new Image();
  im.onload = () => { const k = Math.min(1, 2000 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok({ url: c.toDataURL('image/jpeg', .85), w: c.width, h: c.height }); };
  im.onerror = () => { URL.revokeObjectURL(u); no(new Error('img')); }; im.src = u;
});

/** several scanned pages into one A4 PDF */
export async function scanToPdf(pages: { url: string; w: number; h: number }[]) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pages.forEach((p, i) => { if (i) pdf.addPage(); const W = 210, H = 297, k = Math.min(W / p.w, H / p.h); pdf.addImage(p.url, 'JPEG', (W - p.w * k) / 2, (H - p.h * k) / 2, p.w * k, p.h * k); });
  return new Blob([pdf.output('blob')], { type: 'application/pdf' });
}

export async function download(name: string, blob: Blob) {
  const nav: any = navigator;
  const file = new File([blob], name, { type: blob.type });
  // on phones the share sheet lets you save to Files or open it in the calendar
  if (nav.canShare && /Android|iPhone|iPad/i.test(navigator.userAgent) && nav.canShare({ files: [file] })) { try { await nav.share({ files: [file] }); return; } catch (e: any) { if (e?.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
