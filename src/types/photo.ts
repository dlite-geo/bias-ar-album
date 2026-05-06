export interface Photo {
  id: string;
  name: string;
  blobUrl: string;        // ObjectURL of the original file (used by lightbox <img>)
  bitmap: ImageBitmap;     // Downscaled bitmap used as the WebGL texture
  aspectRatio: number;     // width / height of the original image
}
