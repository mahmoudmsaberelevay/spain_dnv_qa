import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Image, Video, Music, FileText, Download, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 24;

function getMediaCategory(mimeType: string | null | undefined): string {
  if (!mimeType) return "document";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  image: <Image className="h-4 w-4 text-blue-400" />,
  video: <Video className="h-4 w-4 text-purple-400" />,
  audio: <Music className="h-4 w-4 text-green-400" />,
  document: <FileText className="h-4 w-4 text-orange-400" />,
};

function formatSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

export default function WaQcMedia() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = trpc.waQc.media.list.useQuery({
    type: typeFilter as "all" | "image" | "video" | "audio" | "document",
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }, { refetchInterval: page === 0 ? 30000 : false });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Media Viewer</h1>
          <p className="text-sm text-muted-foreground">Browse images, videos, audio, and documents</p>
        </div>
        <Badge variant="outline" className="text-xs">{data?.total?.toLocaleString() ?? "—"} files</Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 bg-card border-border/50">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading media...</div>
      ) : !data?.rows?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Image className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No media files found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {data.rows.map((file) => {
              const category = getMediaCategory(file.mimeType);
              const mediaUrl = file.storageUrl;
              return (
                <Card key={file.id} className="border-border/50 overflow-hidden group hover:border-primary/30 transition-colors">
                  <div className="aspect-square bg-accent/20 flex items-center justify-center relative overflow-hidden">
                    {category === "image" && mediaUrl ? (
                      <img src={mediaUrl} alt={file.fileName || "image"} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        {TYPE_ICONS[category] || <FileText className="h-8 w-8 text-muted-foreground/40" />}
                        <span className="text-[10px] text-muted-foreground uppercase">{category}</span>
                      </div>
                    )}
                    {mediaUrl && (
                      <a
                        href={mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-5 w-5 text-white" />
                      </a>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <p className="text-[10px] text-muted-foreground truncate">{file.fileName || category}</p>
                    {file.fileSize && <p className="text-[10px] text-muted-foreground/60">{formatSize(file.fileSize)}</p>}
                    <p className="text-[10px] text-muted-foreground/50">{file.mimeType || ""}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
