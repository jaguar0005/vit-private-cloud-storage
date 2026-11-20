import prisma from '../db/prisma.js';

export interface SearchFilters {
  query?: string;
  category?: 'ALL' | 'DOCUMENTS' | 'IMAGES' | 'MEDIA' | 'ARCHIVES' | 'CODE';
  minSizeBytes?: number;
  maxSizeBytes?: number;
  startDate?: string;
  endDate?: string;
}

const CATEGORY_EXTENSIONS: Record<string, string[]> = {
  DOCUMENTS: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages', 'md', 'epub', 'xlsx', 'csv', 'pptx'],
  IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'ico'],
  MEDIA: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'flac', 'aac', 'ogg'],
  ARCHIVES: ['zip', 'rar', 'tar', 'gz', 'bz2', '7z', 'xz'],
  CODE: ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'cs', 'html', 'css', 'json', 'yml', 'yaml', 'xml', 'sql', 'sh'],
};

export class SearchService {
  /**
   * Search active files and folders for a specific authenticated user
   */
  public static async searchUserFiles(userId: string, filters: SearchFilters) {
    const {
      query,
      category = 'ALL',
      minSizeBytes,
      maxSizeBytes,
      startDate,
      endDate,
    } = filters;

    // Build Prisma where clause for Files
    const fileWhere: any = {
      user_id: userId,
      deleted_at: null,
    };

    // Text search filter
    if (query && query.trim().length > 0) {
      fileWhere.name = {
        contains: query.trim(),
        mode: 'insensitive',
      };
    }

    // Category extension filter
    if (category && category !== 'ALL' && CATEGORY_EXTENSIONS[category]) {
      const extensions = CATEGORY_EXTENSIONS[category];
      fileWhere.OR = extensions.map((ext) => ({
        name: {
          endsWith: `.${ext}`,
          mode: 'insensitive',
        },
      }));
    }

    // Size range filter
    if (minSizeBytes !== undefined || maxSizeBytes !== undefined) {
      fileWhere.size_bytes = {};
      if (minSizeBytes !== undefined) fileWhere.size_bytes.gte = BigInt(minSizeBytes);
      if (maxSizeBytes !== undefined) fileWhere.size_bytes.lte = BigInt(maxSizeBytes);
    }

    // Date range filter
    if (startDate || endDate) {
      fileWhere.created_at = {};
      if (startDate) fileWhere.created_at.gte = new Date(startDate);
      if (endDate) fileWhere.created_at.lte = new Date(endDate);
    }

    // Matching folders if a text query is present and category is ALL
    let folders: any[] = [];
    if (category === 'ALL' && (!minSizeBytes || minSizeBytes === 0)) {
      const folderWhere: any = {
        user_id: userId,
        deleted_at: null,
      };
      if (query && query.trim().length > 0) {
        folderWhere.name = {
          contains: query.trim(),
          mode: 'insensitive',
        };
      }
      folders = await prisma.folder.findMany({
        where: folderWhere,
        orderBy: { updated_at: 'desc' },
        take: 20,
      });
    }

    const files = await prisma.file.findMany({
      where: fileWhere,
      include: {
        folder: {
          select: { id: true, name: true },
        },
      },
      orderBy: { updated_at: 'desc' },
      take: 100,
    });

    return {
      query: query || '',
      category,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        sizeBytes: f.size_bytes.toString(),
        mimeType: f.mime_type,
        folderId: f.folder_id,
        folderName: f.folder?.name || 'Root Vault',
        isStarred: f.is_starred,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_id,
        createdAt: f.created_at,
      })),
      totalMatches: files.length + folders.length,
    };
  }
}

export default SearchService;
