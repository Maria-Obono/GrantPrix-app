/**
 * Image compression utility to keep Firestore documents under 1MB limit.
 */
export const compressImage = (file: File, maxWidth: number = 400, maxHeight: number = 400, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Basic type check
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        // Use jpeg for better compression of photos
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Final size check (approximate)
        const sizeInBytes = Math.round((dataUrl.length * 3) / 4);
        if (sizeInBytes > 800000) { // 800KB limit to be safe
          // If still too large, try lower quality
          resolve(canvas.toDataURL('image/jpeg', quality * 0.5));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};
