import { useEffect, useRef } from "preact/hooks";

import type { ImageRef } from "../domain/index.js";
import { ArtworkDisclosure } from "./ArtworkDisclosure.js";

export interface DialogImage {
  readonly src: string;
  readonly alt: string;
  readonly title: string;
  readonly rightsRecord?: ImageRef;
}

interface ImageDialogProps {
  readonly image: DialogImage | null;
  readonly onClose: () => void;
}

export function ImageDialog({ image, onClose }: ImageDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (image && !dialog.open) dialog.showModal();
    if (!image && dialog.open) dialog.close();
  }, [image]);

  return (
    <dialog
      class="image-modal"
      ref={dialogRef}
      aria-label={image?.title || "Character image"}
      onClose={onClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) event.currentTarget.close();
      }}
    >
      <div class="image-modal__panel">
        <button class="icon-button image-modal__close" type="button" aria-label="Close image" onClick={onClose}>
          ×
        </button>
        {image ? <img src={image.src} alt={image.alt} decoding="async" /> : null}
        <strong>{image?.title}</strong>
        {image?.rightsRecord ? (
          <ArtworkDisclosure image={image.rightsRecord} className="image-modal__disclosure" />
        ) : null}
      </div>
    </dialog>
  );
}
