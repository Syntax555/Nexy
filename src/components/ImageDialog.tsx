import type { ImageRef } from "../domain/index.js";
import { ArtworkDisclosure } from "./ArtworkDisclosure.js";
import { useModalDialog } from "./useModalDialog.js";

export interface DialogImage {
  readonly src: string;
  readonly alt: string;
  readonly title: string;
  readonly rightsRecord?: ImageRef;
}

interface ImageDialogProps {
  readonly image: DialogImage | null;
  readonly returnFocus: HTMLElement | null;
  readonly onClose: () => void;
}

export function ImageDialog({ image, returnFocus, onClose }: ImageDialogProps) {
  const { dialogRef, handleCancel, handleClose, requestClose } = useModalDialog(Boolean(image), onClose, returnFocus);

  return (
    <dialog
      class="image-modal"
      ref={dialogRef}
      aria-label={image?.title || "Character image"}
      onCancel={handleCancel}
      onClose={handleClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) requestClose();
      }}
    >
      <div class="image-modal__panel">
        <button
          class="icon-button image-modal__close"
          type="button"
          aria-label="Close image"
          data-dialog-initial-focus
          onClick={requestClose}
        >
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
