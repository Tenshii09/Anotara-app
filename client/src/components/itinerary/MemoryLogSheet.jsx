/**
 * Interactive Memory Log bottom sheet (Feature 6).
 *
 * Lets users attach photos and notes to a single itinerary block.  Photos are
 * uploaded as base64 data URLs because the backend keeps them inside MySQL
 * (LONGTEXT) — no separate object storage required for the school SaaS
 * deployment. Note text is plain UTF-8 and capped to 1k characters in the UI.
 */
import { useEffect, useRef, useState } from "react";

import BottomSheet from "../common/BottomSheet";
import Icon from "../common/Icon";
import { successHaptic, tapHaptic, warningHaptic } from "../../lib/haptics";

const MAX_FILE_BYTES = 1024 * 1024 * 4;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function relativeTime(timestamp) {
  if (!timestamp) return "";
  const created = new Date(timestamp);
  if (Number.isNaN(created.getTime())) return "";
  const diff = Math.max(1, Math.round((Date.now() - created.getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function MemoryLogSheet({
  open,
  onClose,
  place,
  memories = [],
  currentUserId,
  onAddMemory,
  onDeleteMemory,
}) {
  const [tab, setTab] = useState("photo");
  const [noteText, setNoteText] = useState("");
  const [photoData, setPhotoData] = useState(null);
  const [photoMime, setPhotoMime] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    async function resetForm() {
      setTab("photo");
      setNoteText("");
      setPhotoData(null);
      setPhotoMime(null);
      setError("");
      setBusy(false);
    }
    resetForm();
    return undefined;
  }, [open, place?.item_id]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      warningHaptic();
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      warningHaptic();
      setError("Photo is too large (4MB max). Try resizing it first.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setPhotoData(dataUrl);
      setPhotoMime(file.type);
      setError("");
    } catch {
      setError("Could not read that image. Try another.");
    }
  }

  async function submitPhoto() {
    if (!photoData) {
      setError("Pick a photo first or switch to the Note tab.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onAddMemory?.({ kind: "photo", imageData: photoData, mimeType: photoMime });
      successHaptic();
      setPhotoData(null);
      setPhotoMime(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (submissionError) {
      setError(submissionError?.message || "Could not save the photo.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNote() {
    if (!noteText.trim()) {
      setError("Add a quick note before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onAddMemory?.({ kind: "note", note: noteText.trim() });
      successHaptic();
      setNoteText("");
    } catch (submissionError) {
      setError(submissionError?.message || "Could not save the note.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(memory) {
    if (!memory?.id) return;
    setBusy(true);
    setError("");
    try {
      await onDeleteMemory?.(memory);
    } catch (deletionError) {
      setError(deletionError?.message || "Could not remove that memory.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={place ? `Memories · ${place.name}` : "Memory log"}
      size="lg"
    >
      <div className="memorylog">
        <div className="memorylog__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "photo"}
            className={`memorylog__tab${tab === "photo" ? " is-active" : ""}`}
            onClick={() => {
              tapHaptic();
              setTab("photo");
              setError("");
            }}
          >
            <Icon name="camera" size={16} /> Photo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "note"}
            className={`memorylog__tab${tab === "note" ? " is-active" : ""}`}
            onClick={() => {
              tapHaptic();
              setTab("note");
              setError("");
            }}
          >
            <Icon name="note" size={16} /> Note
          </button>
        </div>

        {error ? <p className="memorylog__error">{error}</p> : null}

        {tab === "photo" ? (
          <div className="memorylog__panel">
            <label className="memorylog__dropzone">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                ref={fileInputRef}
                hidden
              />
              {photoData ? (
                <img src={photoData} alt="Selected memory preview" />
              ) : (
                <span className="memorylog__dropzone-empty">
                  <Icon name="image" size={28} />
                  <span>Tap to take or pick a photo</span>
                  <small>Max 4MB · jpg, png, webp</small>
                </span>
              )}
            </label>
            <button
              type="button"
              className="btn-luxury memorylog__cta"
              onClick={submitPhoto}
              disabled={busy || !photoData}
            >
              {busy ? "Saving…" : "Pin photo to this block"}
            </button>
          </div>
        ) : (
          <div className="memorylog__panel">
            <textarea
              className="memorylog__textarea"
              maxLength={1000}
              rows={4}
              value={noteText}
              placeholder="We paid 50 pesos for parking… the guide was named Kuya Jun"
              onChange={(event) => setNoteText(event.target.value)}
            />
            <div className="memorylog__counter">{noteText.length}/1000</div>
            <button
              type="button"
              className="btn-luxury memorylog__cta"
              onClick={submitNote}
              disabled={busy || !noteText.trim()}
            >
              {busy ? "Saving…" : "Save note to this block"}
            </button>
          </div>
        )}

        <section className="memorylog__list" aria-label="Saved memories">
          <p className="dashboard-kicker">Saved memories · {memories.length}</p>
          {memories.length === 0 ? (
            <p className="memorylog__empty">
              No memories yet. Capture a photo or jot a note above to start your scrapbook.
            </p>
          ) : (
            <ul className="memorylog__grid">
              {memories.map((memory) => (
                <li key={memory.id} className="memorylog__item">
                  {memory.kind === "photo" && memory.image_data ? (
                    <img src={memory.image_data} alt={memory.note || "Memory"} />
                  ) : (
                    <div className="memorylog__note">
                      <Icon name="note" size={16} />
                      <p>{memory.note || ""}</p>
                    </div>
                  )}
                  <div className="memorylog__item-meta">
                    <span>{memory.username || "You"}</span>
                    <span>{relativeTime(memory.created_at)}</span>
                  </div>
                  {Number(memory.user_id) === Number(currentUserId) ? (
                    <button
                      type="button"
                      className="memorylog__delete"
                      onClick={() => handleDelete(memory)}
                      aria-label="Remove memory"
                      disabled={busy}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </BottomSheet>
  );
}
