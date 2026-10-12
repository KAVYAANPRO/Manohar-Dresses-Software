/** Draws `text` diagonally, semi-transparent, tiled across the image — burns it into the pixels via canvas. */
export function renderWatermarkedImage(imageSrc: string, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      ctx.drawImage(img, 0, 0);

      const fontSize = Math.max(16, Math.round(canvas.width / 18));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      const stepY = fontSize * 3;
      const rows = Math.ceil(canvas.height / stepY) + 2;
      for (let i = -rows; i <= rows; i++) {
        ctx.fillText(text, 0, i * stepY);
        ctx.strokeText(text, 0, i * stepY);
      }
      ctx.restore();

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = imageSrc;
  });
}

export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}
