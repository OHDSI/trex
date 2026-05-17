import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Trash2, Copy, Calendar, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import * as api from "@/lib/api";
import type { App } from "@/lib/types";
import { toast } from "sonner";

export default function AppDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Duplicate
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getApp(id)
      .then((data) => {
        setApp(data);
        setNameValue(data.name);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  const handleSaveName = async () => {
    if (!app || !nameValue.trim() || nameValue.trim() === app.name) {
      setEditingName(false);
      setNameValue(app?.name || "");
      return;
    }
    try {
      const updated = await api.updateApp(app.id, { name: nameValue.trim() });
      setApp(updated);
      setNameValue(updated.name);
      toast.success("App renamed");
    } catch (err: unknown) {
      toast.error("Failed to rename app");
      setNameValue(app.name);
    }
    setEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      setEditingName(false);
      setNameValue(app?.name || "");
    }
  };

  const handleDelete = async () => {
    if (!app) return;
    setDeleting(true);
    try {
      await api.deleteApp(app.id);
      toast.success("App deleted");
      navigate("/");
    } catch {
      toast.error("Failed to delete app");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleDuplicate = async () => {
    if (!app) return;
    setDuplicating(true);
    try {
      const newApp = await api.duplicateApp(app.id);
      toast.success(`Created "${newApp.name}"`);
      navigate(`/apps/${newApp.id}`);
    } catch {
      toast.error("Failed to duplicate app");
    } finally {
      setDuplicating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-destructive">{error || "App not found"}</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center border-b px-4 h-12 shrink-0 gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold">App Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
        {/* App Name Section */}
        <section className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            App Name
          </label>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                ref={nameInputRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveName}
                className="text-lg font-semibold h-10"
              />
              <Button variant="ghost" size="icon" onClick={handleSaveName}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditingName(false);
                  setNameValue(app.name);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h2 className="text-lg font-semibold">{app.name}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 h-7 w-7"
                onClick={() => setEditingName(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </section>

        <Separator />

        {/* Details Section */}
        <section className="space-y-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Details
          </h3>
          <div className="grid gap-4">
            {app.tech_stack && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tech Stack</span>
                <Badge variant="secondary">{app.tech_stack}</Badge>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(app.created_at)}
              </span>
            </div>
            {app.path && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Path</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded">{app.path}</code>
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* Actions Section */}
        <section className="space-y-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Actions
          </h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDuplicate}
              disabled={duplicating}
            >
              <Copy className="h-3.5 w-3.5 mr-2" />
              {duplicating ? "Duplicating..." : "Duplicate App"}
            </Button>
          </div>
        </section>

        <Separator />

        {/* Danger Zone */}
        <section className="space-y-4">
          <h3 className="text-xs font-medium text-destructive uppercase tracking-wide">
            Danger Zone
          </h3>
          <div className="border border-destructive/30 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Delete this app</p>
              <p className="text-xs text-muted-foreground">
                This will permanently delete the app, its workspace files, and all associated data.
                This action cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete App
            </Button>
          </div>
        </section>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{app.name}"?</DialogTitle>
            <DialogDescription>
              This will permanently delete the app, its workspace files, and all associated
              data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
