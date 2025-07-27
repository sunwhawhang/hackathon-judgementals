import { Judge } from './defaultJudges.js';


export interface ProjectFile {
    name: string;
    content?: string;  // Optional for Firebase Storage
    type: string;
    size: number;
    path: string;
    storageUrl?: string;  // Firebase Storage URL
    storagePath?: string; // Firebase Storage path
}

export interface Project {
    name: string;
    files: ProjectFile[];
    droppedSummary?: string[];
}

export interface JudgeResult {
    judgeId: string;
    judgeName: string;
    summary: string;
    score: number;
    likes: string[];
    dislikes: string[];
}

export interface ProjectEvaluation {
    projectName: string;
    judgeResults: JudgeResult[];
    finalRank?: number;
}

export interface ClientFilterStats {
    totalFiles: number;
    filteredFiles: number;
    filteredCount: number;
    filterRatio: string;
    droppedFolders: string[];
    droppedFiles: string[];
    filesByDirectory: Record<string, string[]>;
    oversizedFiles: Array<{ name: string; size: number }>;
}

export interface UploadResponse {
    success: boolean;
    projectName: string;
    files: ProjectFile[];
    skippedFiles?: number;
    totalSize?: number;
    warnings?: string[];
    droppedSummary?: string[];
    error?: string;
}

export interface ClaudeAPIResponse {
    success: boolean;
    response: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
    error?: string;
    warning?: string;
}

export interface SavedSession {
    id: string;
    name: string;
    projects: Project[];
    judges: Judge[];
    evaluations: ProjectEvaluation[];
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    // Share upload URL state
    shareUploadUrlGenerated?: boolean;
    shareUploadSectionExpanded?: boolean;
}

export interface SessionChanges {
    projectsToDelete?: Project[]; // Projects to delete
    projectsToAdd?: Project[]; // Projects to add
    judgesToDelete?: Judge[]; // Judges to delete
    judgesToAdd?: Judge[]; // Judges to add
}