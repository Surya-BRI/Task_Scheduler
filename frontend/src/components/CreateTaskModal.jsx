// @ts-nocheck
import { useEffect, useId, useRef, useState } from 'react';
import { Pencil, X } from 'lucide-react';
const DESIGN_OPTIONS = [
    { id: 'estimation', label: 'Estimation Purpose' },
    { id: 'presentation', label: 'Presentation' },
    { id: 'client', label: 'Client Submission' },
    { id: 'technical', label: 'Technical Drawing' },
];
export function CreateTaskModal({ open, onClose }) {
    const titleId = useId();
    const fileInputRef = useRef(null);
    const [providedFile, setProvidedFile] = useState('');
    const [hod, setHod] = useState('');
    const [designs, setDesigns] = useState(() => ({
        estimation: false,
        presentation: false,
        client: false,
        technical: false,
    }));
    const [deadline, setDeadline] = useState('');
    const [comment, setComment] = useState('');
    useEffect(() => {
        if (!open)
            return undefined;
        function onKey(e) {
            if (e.key === 'Escape')
                onClose();
        }
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);
    if (!open)
        return null;
    function toggleDesign(id) {
        setDesigns((prev) => ({ ...prev, [id]: !prev[id] }));
    }
    function handleSubmit(e) {
        e.preventDefault();
        onClose();
    }
    function handlePickFile() {
        fileInputRef.current?.click();
    }
    return (<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Close dialog" onClick={onClose}/>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 bg-[#0f4a7a] px-5 py-4 text-white">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/15">
              <Pencil className="h-4 w-4" aria-hidden/>
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-semibold leading-tight">
                Create Task
              </h2>
              <p className="mt-0.5 text-sm text-blue-100">Get things moving</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80" aria-label="Close">
            <X className="h-5 w-5"/>
          </button>
        </div>

        <form className="space-y-4 p-5" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-provided-files">
              Provided Files
            </label>
            <div className="mt-1.5 flex gap-2">
              <input id="create-provided-files" value={providedFile} readOnly placeholder="Select File" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"/>
              <button type="button" onClick={handlePickFile} className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Browse
              </button>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setProvidedFile(e.target.files?.[0]?.name ?? '')}/>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-hod">
              Select HOD
            </label>
            <select id="create-hod" value={hod} onChange={(e) => setHod(e.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25">
              <option value="">Select</option>
              <option value="hod-1">A. Khan</option>
              <option value="hod-2">M. Rahman</option>
            </select>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-slate-600">Select which designs are required</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DESIGN_OPTIONS.map((opt) => (<label key={opt.id} className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" checked={designs[opt.id]} onChange={() => toggleDesign(opt.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"/>
                  {opt.label}
                </label>))}
            </div>
          </fieldset>

          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-deadline">
              Deadline for Task Submission
            </label>
            <select id="create-deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25">
              <option value="">Select</option>
              <option value="3d">3 days</option>
              <option value="1w">1 week</option>
              <option value="2w">2 weeks</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-comment">
              Comment
            </label>
            <textarea id="create-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} className="mt-1.5 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"/>
          </div>

          <div className="flex justify-center pt-1">
            <button type="submit" className="rounded-full bg-[#10a6e3] px-10 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>);
}
