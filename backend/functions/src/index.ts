import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { Anthropic } from '@anthropic-ai/sdk';
import Busboy from 'busboy';
import { extname, join } from 'path';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import { simpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as os from 'os';

// Define the secret for production, but use environment variable for local development
const anthropicApiKey = defineSecret('anthropic-api-key');

// Initialize Firebase Admin
admin.initializeApp();

// Initialize Firestore
const db = admin.firestore();

// Interface definitions
interface ProjectFile {
    name: string;
    content: string;
    type: string;
    size: number;
    path: string;
}

interface ClientFilterStats {
    totalFiles: number;
    filteredFiles: number;
    filteredCount: number;
    filterRatio: string;
    droppedFolders: string[];
    droppedFiles: string[];
    filesByDirectory: Record<string, string[]>;
    oversizedFiles: Array<{ name: string; size: number }>;
}

interface UploadResponse {
    success: boolean;
    projectName: string;
    files: ProjectFile[];
    skippedFiles?: number;
    totalSize?: number;
    warnings?: string[];
    droppedSummary?: string[];
    error?: string;
}

interface ClaudeRequest {
    prompt: string;
    seed: number;
}

// File filtering constants
const IGNORED_DIRECTORIES = [
    'node_modules', 'bower_components', 'vendor', 'packages', 'deps', 'dependencies',
    '.git', '.svn', '.hg', '.bzr',
    'dist', 'build', 'target', 'bin', 'obj', 'out', 'lib', 'libs', '.next',
    '__pycache__', '.venv', 'venv', 'env', '.env', '.pytest_cache',
    'coverage', '.nyc_output', '.coverage', 'htmlcov',
    '.gradle', '.mvn', '.idea', '.vscode', '.vs',
    'tmp', 'temp', 'cache', '.cache', '.tmp',
    '.DS_Store', 'Thumbs.db',
    'logs', '.sass-cache', '.nuxt', '.output'
];

const IGNORED_EXTENSIONS = [
    '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib',
    '.class', '.jar', '.war', '.ear', '.deb', '.rpm', '.dmg', '.iso',
    '.mp4', '.avi', '.mov', '.wmv', '.mp3', '.wav', '.flac', '.aac',
    '.min.js', '.min.css', '.bundle.js', '.chunk.js', '.woff', '.woff2',
    '.ttf', '.eot', '.map', '.lock',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.svg', '.webp',
    '.ico', '.cur', '.psd', '.ai', '.sketch', '.fig'
];

const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total per project

function shouldIgnoreFile(filepath: string): boolean {
    const filename = filepath.toLowerCase();
    const pathParts = filepath.split('/');

    // Check if any directory in the path should be ignored
    for (const part of pathParts) {
        const lowerPart = part.toLowerCase();

        // Ignore hidden directories
        if (part.startsWith('.') && part !== '.' && part !== '..') {
            const allowedDotFiles = ['.env.example', '.gitignore', '.github', '.gitattributes', '.editorconfig'];
            if (!allowedDotFiles.includes(part)) {
                return true;
            }
        }

        // Check against explicit ignore list
        if (IGNORED_DIRECTORIES.includes(lowerPart)) {
            return true;
        }
    }

    // Check file extension
    const ext = extname(filename);
    if (IGNORED_EXTENSIONS.includes(ext)) {
        return true;
    }

    // Ignore hidden files
    const basename = pathParts[pathParts.length - 1];
    if (basename.startsWith('.')) {
        const allowedDotFiles = ['.env.example', '.gitignore', '.gitattributes', '.editorconfig', '.babelrc', '.eslintrc', '.prettierrc'];
        if (!allowedDotFiles.some(allowed => basename.startsWith(allowed.split('.')[1]))) {
            return true;
        }
    }

    return false;
}

function isTextFile(filename: string, mimetype?: string): boolean {
    if (mimetype) {
        if (mimetype.startsWith('text/') ||
            mimetype === 'application/json' ||
            mimetype === 'application/javascript' ||
            mimetype === 'application/xml') {
            return true;
        }
    }

    const ext = extname(filename.toLowerCase());
    const textExtensions = [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
        '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj',
        '.html', '.css', '.scss', '.sass', '.less', '.xml', '.json', '.yaml', '.yml',
        '.md', '.txt', '.log', '.cfg', '.conf', '.ini', '.env', '.sh', '.bat',
        '.sql', '.r', '.m', '.pl', '.lua', '.vim', '.dockerfile', '.makefile'
    ];

    return textExtensions.includes(ext) || filename.toLowerCase().includes('makefile') || filename.toLowerCase().includes('dockerfile');
}

function getFileType(filename: string): string {
    const ext = extname(filename.toLowerCase());
    const typeMap: Record<string, string> = {
        '.js': 'text/javascript',
        '.ts': 'text/typescript',
        '.jsx': 'text/javascript',
        '.tsx': 'text/typescript',
        '.py': 'text/python',
        '.java': 'text/java',
        '.html': 'text/html',
        '.css': 'text/css',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.md': 'text/markdown',
        '.txt': 'text/plain'
    };

    return typeMap[ext] || 'application/octet-stream';
}

async function callClaude(prompt: string, seed: number): Promise<{ content: string; usage: any }> {
    try {
        // For local development, prioritize environment variable
        // For production, fall back to Firebase secret
        let apiKey: string | undefined;
        
        // First try environment variable (local development)
        apiKey = process.env.ANTHROPIC_API_KEY;
        
        // If not found and we're in production, try the secret
        if (!apiKey) {
            try {
                apiKey = anthropicApiKey.value();
            } catch (secretError) {
                console.warn('Failed to access Firebase secret, using environment variable fallback');
            }
        }
        
        if (!apiKey) {
            throw new Error('Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable for local development.');
        }

        console.log('🔑 Using API key for Claude request (key length:', apiKey.length, 'chars)');

        // Initialize Anthropic with the API key
        const anthropic = new Anthropic({
            apiKey: apiKey
        });

        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2000,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            system: `You are evaluating hackathon projects. Use consistent evaluation criteria. Random seed: ${seed}`
        });

        return {
            content: response.content[0].type === 'text' ? response.content[0].text : '',
            usage: response.usage
        };
    } catch (error) {
        console.error('Claude API error:', error);
        throw error;
    }
}

interface ProcessedFile {
    fieldname: string;
    originalname: string;
    mimetype: string;
    buffer: Buffer;
}

async function processMultipartData(req: any): Promise<{ fields: Record<string, string>; files: ProcessedFile[] }> {
    return new Promise((resolve, reject) => {
        const fields: Record<string, string> = {};
        const files: ProcessedFile[] = [];

        console.log('Processing multipart data...');
        console.log('Request headers:', req.headers);

        const bb = Busboy({ headers: req.headers });

        bb.on('field', (name: string, val: string) => {
            console.log(`Field received: ${name} = ${val}`);
            fields[name] = val;
        });

        bb.on('file', (name: string, file: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
            console.log(`File received: ${name}, filename: ${info.filename}, mimetype: ${info.mimeType}`);
            const chunks: Buffer[] = [];

            file.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            file.on('end', () => {
                console.log(`File processing complete: ${info.filename}, size: ${Buffer.concat(chunks).length} bytes`);
                files.push({
                    fieldname: name,
                    originalname: info.filename,
                    mimetype: info.mimeType,
                    buffer: Buffer.concat(chunks)
                });
            });
        });

        bb.on('finish', () => {
            console.log(`Multipart processing finished. Fields: ${Object.keys(fields).length}, Files: ${files.length}`);
            resolve({ fields, files });
        });

        bb.on('error', (error: any) => {
            console.error('Busboy error:', error);
            reject(error);
        });

        req.on('error', (error: any) => {
            console.error('Request error:', error);
            reject(error);
        });

        req.pipe(bb);
    });
}

async function processUploadedFiles(
    files: ProcessedFile[],
    projectName: string,
    clientFilterStats?: string
): Promise<UploadResponse> {
    console.log(`Processing ${files.length} files for project: ${projectName}`);

    const processedFiles: ProjectFile[] = [];
    let totalSize = 0;
    let skippedFiles = 0;
    const warnings: string[] = [];
    const droppedSummary: string[] = [];

    for (const file of files) {
        try {
            if (shouldIgnoreFile(file.originalname)) {
                skippedFiles++;
                continue;
            }

            if (file.buffer.length > MAX_FILE_SIZE) {
                skippedFiles++;
                continue;
            }

            if (totalSize + file.buffer.length > MAX_TOTAL_SIZE) {
                skippedFiles++;
                continue;
            }

            const isText = isTextFile(file.originalname, file.mimetype);
            const content = isText ? file.buffer.toString('utf-8') : file.buffer.toString('base64');

            processedFiles.push({
                name: file.originalname,
                content,
                type: file.mimetype || getFileType(file.originalname),
                size: file.buffer.length,
                path: file.originalname
            });

            totalSize += file.buffer.length;
        } catch (error) {
            console.error(`Error processing file ${file.originalname}:`, error);
            skippedFiles++;
        }
    }

    // Parse client-side filtering stats if provided
    if (clientFilterStats) {
        try {
            const clientStats: ClientFilterStats = JSON.parse(clientFilterStats);
            // Use the same detailed summary builder as folder uploads
            const detailedSummary = buildDroppedSummaryFromStats(clientStats);
            droppedSummary.push(...detailedSummary);
        } catch (error) {
            console.error('Error parsing client filter stats:', error);
        }
    }

    if (skippedFiles > 0) {
        warnings.push(`${skippedFiles} files were skipped due to size limits`);
    }

    return {
        success: true,
        projectName,
        files: processedFiles,
        skippedFiles,
        totalSize,
        warnings,
        droppedSummary: droppedSummary.length > 0 ? droppedSummary : undefined
    };
}

function buildDroppedSummaryFromStats(stats: ClientFilterStats): string[] {
    const droppedSummary: string[] = [];

    if (stats.filteredCount > 0) {
        droppedSummary.push(`📊 Processing Summary: ${stats.filteredCount} files excluded from ${stats.totalFiles} total files`);

        // Find common prefix for ALL paths first
        let commonPrefix = '';
        const allPaths = [...stats.droppedFolders, ...Object.keys(stats.droppedFiles.length > 0 ? (() => {
            const filesByDir: Record<string, string[]> = {};
            stats.droppedFiles.forEach(file => {
                const dir = file.substring(0, file.lastIndexOf('/')) || '.';
                if (!filesByDir[dir]) filesByDir[dir] = [];
            });
            return filesByDir;
        })() : {})];

        if (allPaths.length > 1) {
            commonPrefix = allPaths[0];
            for (const path of allPaths) {
                while (commonPrefix && !path.startsWith(commonPrefix)) {
                    commonPrefix = commonPrefix.substring(0, commonPrefix.lastIndexOf('/'));
                }
            }
            if (commonPrefix) commonPrefix += '/';
        }

        // Show dropped folders (exact same format as folder upload)
        if (stats.droppedFolders && stats.droppedFolders.length > 0) {
            droppedSummary.push(`📁 Excluded folders:`);
            const folders = stats.droppedFolders.sort();
            folders.forEach(folder => {
                const cleanFolder = commonPrefix ? folder.replace(commonPrefix, '') : folder;
                const displayFolder = cleanFolder || folder;
                droppedSummary.push(`    ${displayFolder}`);
            });
        }

        // Show dropped files with directory grouping and clean formatting (exact same format)
        if (stats.droppedFiles && stats.droppedFiles.length > 0) {
            const filesByDir: Record<string, string[]> = {};

            stats.droppedFiles.forEach(file => {
                const dir = file.substring(0, file.lastIndexOf('/')) || '.';
                const fileName = file.substring(file.lastIndexOf('/') + 1);
                if (!filesByDir[dir]) filesByDir[dir] = [];
                filesByDir[dir].push(fileName);
            });

            droppedSummary.push(`📄 Excluded files:`);
            Object.keys(filesByDir).sort().forEach(dir => {
                const files = filesByDir[dir];
                const cleanDir = commonPrefix ? dir.replace(commonPrefix, '') : dir;
                const displayDir = cleanDir || '.';

                droppedSummary.push(`    ${displayDir}:`);
                files.forEach(file => {
                    droppedSummary.push(`        ${file}`);
                });
            });
        }

        // Show oversized files (exact same format)
        if (stats.oversizedFiles && stats.oversizedFiles.length > 0) {
            droppedSummary.push(`📏 Oversized files:`);
            stats.oversizedFiles.forEach(f => {
                const cleanName = commonPrefix ? f.name.replace(commonPrefix, '') : f.name;
                const displayName = cleanName || f.name;
                droppedSummary.push(`    ${displayName} (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
            });
        }
    }

    return droppedSummary;
}

async function cloneGitHubRepository(githubUrl: string, projectName: string): Promise<UploadResponse> {
    const tempDir = join(os.tmpdir(), `clone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    try {
        console.log(`Cloning GitHub repository: ${githubUrl} to ${tempDir}`);

        // Clone the repository
        const git = simpleGit();
        await git.clone(githubUrl, tempDir, { '--depth': 1 }); // Shallow clone for faster download

        console.log(`Repository cloned successfully to ${tempDir}`);

        // Read all files from the cloned repository and build detailed filtering stats
        const allFiles = await readAllFilesInDirectory(tempDir, tempDir);
        const filteredFiles = await readFilesFromDirectory(tempDir, tempDir);
        console.log(`Found ${allFiles.length} total files, ${filteredFiles.length} after filtering`);
        console.log('Sample all files:', allFiles.slice(0, 5).map(f => f.originalname));
        console.log('Sample filtered files:', filteredFiles.slice(0, 5).map(f => f.originalname));

        // Build the exact same filtering stats as folder uploads
        const clientFilterStats = buildGitHubFilteringStats(allFiles, filteredFiles, githubUrl);
        console.log('GitHub filtering stats:', JSON.stringify(clientFilterStats, null, 2));

        // Process files with the generated client stats (same as folder upload)
        const result = await processUploadedFiles(filteredFiles, projectName, JSON.stringify(clientFilterStats));
        console.log('GitHub result droppedSummary:', result.droppedSummary);

        // Clean up temporary directory
        await fs.remove(tempDir);
        console.log(`Cleaned up temporary directory: ${tempDir}`);

        return result;

    } catch (error) {
        console.error('Error cloning GitHub repository:', error);

        // Clean up on error
        try {
            await fs.remove(tempDir);
        } catch (cleanupError) {
            console.error('Error cleaning up temp directory:', cleanupError);
        }

        throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function readAllFilesInDirectory(dirPath: string, basePath: string): Promise<ProcessedFile[]> {
    const files: ProcessedFile[] = [];

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        let relativePath = fullPath.replace(basePath, '');
        if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
        }

        if (entry.isDirectory()) {
            // Skip git directory but include everything else for counting
            if (entry.name === '.git') {
                continue;
            }

            // Recursively read subdirectory without filtering
            const subFiles = await readAllFilesInDirectory(fullPath, basePath);
            files.push(...subFiles);
        } else if (entry.isFile()) {
            try {
                const stats = await fs.stat(fullPath);

                // Create a file entry with size info for filtering analysis
                const fileEntry = {
                    fieldname: 'file',
                    originalname: relativePath,
                    mimetype: getFileType(entry.name),
                    buffer: Buffer.alloc(1), // Minimal buffer
                    fileSize: stats.size // Store actual file size
                } as ProcessedFile & { fileSize: number };

                files.push(fileEntry);

            } catch (error) {
                console.error(`Error reading file ${fullPath}:`, error);
                // Skip files that can't be read
                continue;
            }
        }
    }

    return files;
}

function buildGitHubFilteringStats(allFiles: ProcessedFile[], filteredFiles: ProcessedFile[], githubUrl: string): ClientFilterStats {
    const droppedFolders: Set<string> = new Set();
    const droppedFiles: string[] = [];
    const oversizedFiles: Array<{ name: string; size: number }> = [];
    const filesByDirectory: Record<string, string[]> = {};
    let totalFiles = allFiles.length;
    let filteredCount = 0;

    // Build set of filtered file names for comparison
    const filteredFileNames = new Set(filteredFiles.map(f => f.originalname));

    // Process each file to categorize drops (same logic as folder upload)
    for (const file of allFiles) {
        const filePath = file.originalname;

        // Track files by directory
        const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '.';
        if (!filesByDirectory[dir]) {
            filesByDirectory[dir] = [];
        }
        filesByDirectory[dir].push(filePath.substring(filePath.lastIndexOf('/') + 1));

        // Check if file was filtered out
        if (!filteredFileNames.has(filePath)) {
            filteredCount++;

            // Check file size first (same as folder upload: 10MB limit)
            const fileSize = (file as any).fileSize || 0;
            if (fileSize > 10 * 1024 * 1024) {
                oversizedFiles.push({ name: filePath, size: fileSize });
                continue;
            }

            // Check if should be filtered by type/path (same logic as folder upload)
            if (shouldIgnoreFile(filePath)) {
                // Track which folders/files were dropped
                const pathParts = filePath.split('/');
                let foundDroppedFolder = false;

                // Check if this file is in a dropped folder (like node_modules)
                for (let j = 0; j < pathParts.length - 1; j++) {
                    const partialPath = pathParts.slice(0, j + 1).join('/');
                    if (shouldIgnoreFile(partialPath + '/')) {
                        droppedFolders.add(partialPath);
                        foundDroppedFolder = true;
                        break;
                    }
                }

                // If not in a dropped folder, it's an individual dropped file
                if (!foundDroppedFolder) {
                    droppedFiles.push(filePath);
                }
            }
        }
    }

    const filterRatio = totalFiles > 0 ? ((filteredCount / totalFiles) * 100).toFixed(1) : '0';

    return {
        totalFiles: totalFiles,
        filteredFiles: filteredFiles.length,
        filteredCount: filteredCount,
        filterRatio: filterRatio,
        droppedFolders: Array.from(droppedFolders),
        droppedFiles: droppedFiles,
        filesByDirectory: filesByDirectory,
        oversizedFiles: oversizedFiles
    };
}

function buildZipFilteringStats(allZipEntries: any[], extractedFiles: ProcessedFile[], zipFileName: string): ClientFilterStats {
    const droppedFolders: Set<string> = new Set();
    const droppedFiles: string[] = [];
    const oversizedFiles: Array<{ name: string; size: number }> = [];
    const filesByDirectory: Record<string, string[]> = {};
    let totalFiles = allZipEntries.length;
    let filteredCount = 0;

    // Build set of extracted file names for comparison
    const extractedFileNames = new Set(extractedFiles.map(f => f.originalname));

    // Process each ZIP entry to categorize drops (same logic as folder upload)
    for (const entry of allZipEntries) {
        // Skip directories
        if (/\/$/.test(entry.fileName)) {
            continue;
        }

        const filePath = entry.fileName;

        // Track files by directory
        const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '.';
        if (!filesByDirectory[dir]) {
            filesByDirectory[dir] = [];
        }
        filesByDirectory[dir].push(filePath.substring(filePath.lastIndexOf('/') + 1));

        // Check if file was filtered out
        if (!extractedFileNames.has(filePath)) {
            filteredCount++;

            // Check file size first (same as folder upload: 10MB limit)
            if (entry.uncompressedSize > 10 * 1024 * 1024) {
                oversizedFiles.push({ name: filePath, size: entry.uncompressedSize });
                continue;
            }

            // Check if should be filtered by type/path (same logic as folder upload)
            if (shouldIgnoreFile(filePath)) {
                // Track which folders/files were dropped
                const pathParts = filePath.split('/');
                let foundDroppedFolder = false;

                // Check if this file is in a dropped folder (like node_modules)
                for (let j = 0; j < pathParts.length - 1; j++) {
                    const partialPath = pathParts.slice(0, j + 1).join('/');
                    if (shouldIgnoreFile(partialPath + '/')) {
                        droppedFolders.add(partialPath);
                        foundDroppedFolder = true;
                        break;
                    }
                }

                // If not in a dropped folder, it's an individual dropped file
                if (!foundDroppedFolder) {
                    droppedFiles.push(filePath);
                }
            }
        }
    }

    const filterRatio = totalFiles > 0 ? ((filteredCount / totalFiles) * 100).toFixed(1) : '0';

    return {
        totalFiles: totalFiles,
        filteredFiles: extractedFiles.length,
        filteredCount: filteredCount,
        filterRatio: filterRatio,
        droppedFolders: Array.from(droppedFolders),
        droppedFiles: droppedFiles,
        filesByDirectory: filesByDirectory,
        oversizedFiles: oversizedFiles
    };
}

async function readFilesFromDirectory(dirPath: string, basePath: string): Promise<ProcessedFile[]> {
    const files: ProcessedFile[] = [];

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        let relativePath = fullPath.replace(basePath, '');
        if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
        }

        if (entry.isDirectory()) {
            // Skip git directory and other ignored directories
            if (shouldIgnoreFile(relativePath) || entry.name === '.git') {
                continue;
            }

            // Recursively read subdirectory
            const subFiles = await readFilesFromDirectory(fullPath, basePath);
            files.push(...subFiles);
        } else if (entry.isFile()) {
            // Skip ignored files
            if (shouldIgnoreFile(relativePath)) {
                continue;
            }

            try {
                const stats = await fs.stat(fullPath);

                // Skip files larger than 1MB
                if (stats.size > MAX_FILE_SIZE) {
                    continue;
                }

                const buffer = await fs.readFile(fullPath);
                const mimetype = getFileType(entry.name);

                files.push({
                    fieldname: 'file',
                    originalname: relativePath,
                    mimetype: mimetype,
                    buffer: buffer
                });

            } catch (error) {
                console.error(`Error reading file ${fullPath}:`, error);
                // Skip files that can't be read
                continue;
            }
        }
    }

    return files;
}

async function processZipFile(zipFile: ProcessedFile, projectName: string): Promise<UploadResponse> {
    const tempDir = join(os.tmpdir(), `zip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    try {
        console.log(`Extracting ZIP file: ${zipFile.originalname} to ${tempDir}`);

        // Create temp directory
        await fs.ensureDir(tempDir);

        // Extract ZIP file and collect both all entries and extracted files in one pass
        const { allEntries, extractedFiles } = await extractZipFileWithStats(zipFile.buffer, tempDir);
        console.log(`Found ${allEntries.length} total entries, extracted ${extractedFiles.length} files from ZIP`);

        // Build the exact same filtering stats as folder uploads
        const clientFilterStats = buildZipFilteringStats(allEntries, extractedFiles, zipFile.originalname);

        // Process files with the generated client stats (same as folder upload)
        const result = await processUploadedFiles(extractedFiles, projectName, JSON.stringify(clientFilterStats));

        // Clean up temporary directory
        await fs.remove(tempDir);
        console.log(`Cleaned up temporary directory: ${tempDir}`);

        return result;

    } catch (error) {
        console.error('Error processing ZIP file:', error);

        // Clean up on error
        try {
            await fs.remove(tempDir);
        } catch (cleanupError) {
            console.error('Error cleaning up temp directory:', cleanupError);
        }

        throw new Error(`Failed to process ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function extractZipFileWithStats(zipBuffer: Buffer, extractPath: string): Promise<{ allEntries: yauzl.Entry[], extractedFiles: ProcessedFile[] }> {
    return new Promise((resolve, reject) => {
        const allEntries: yauzl.Entry[] = [];
        const extractedFiles: ProcessedFile[] = [];

        yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                reject(err);
                return;
            }

            if (!zipfile) {
                reject(new Error('Failed to read ZIP file'));
                return;
            }

            zipfile.readEntry();

            zipfile.on('entry', (entry: yauzl.Entry) => {
                // Add ALL entries (files and directories) to allEntries for proper stats
                allEntries.push(entry);

                // Skip directories for extraction
                if (/\/$/.test(entry.fileName)) {
                    zipfile.readEntry();
                    return;
                }

                // Skip files that should be ignored
                if (shouldIgnoreFile(entry.fileName)) {
                    zipfile.readEntry();
                    return;
                }

                // Skip files larger than 1MB
                if (entry.uncompressedSize > MAX_FILE_SIZE) {
                    console.log(`Skipping large file: ${entry.fileName} (${entry.uncompressedSize} bytes)`);
                    zipfile.readEntry();
                    return;
                }

                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr) {
                        console.error(`Error reading ${entry.fileName}:`, streamErr);
                        zipfile.readEntry();
                        return;
                    }

                    if (!readStream) {
                        console.error(`No stream for ${entry.fileName}`);
                        zipfile.readEntry();
                        return;
                    }

                    const chunks: Buffer[] = [];

                    readStream.on('data', (chunk: Buffer) => {
                        chunks.push(chunk);
                    });

                    readStream.on('end', () => {
                        const buffer = Buffer.concat(chunks);
                        const mimetype = getFileType(entry.fileName);

                        extractedFiles.push({
                            fieldname: 'file',
                            originalname: entry.fileName,
                            mimetype: mimetype,
                            buffer: buffer
                        });

                        zipfile.readEntry();
                    });

                    readStream.on('error', (readErr) => {
                        console.error(`Error reading stream for ${entry.fileName}:`, readErr);
                        zipfile.readEntry();
                    });
                });
            });

            zipfile.on('end', () => {
                console.log(`ZIP extraction complete: ${allEntries.length} total entries, ${extractedFiles.length} files extracted`);
                resolve({ allEntries, extractedFiles });
            });

            zipfile.on('error', (zipErr) => {
                console.error('ZIP file error:', zipErr);
                reject(zipErr);
            });
        });
    });
}

async function extractZipFile(zipBuffer: Buffer, extractPath: string): Promise<ProcessedFile[]> {
    return new Promise((resolve, reject) => {
        const files: ProcessedFile[] = [];

        yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                reject(err);
                return;
            }

            if (!zipfile) {
                reject(new Error('Failed to read ZIP file'));
                return;
            }

            zipfile.readEntry();

            zipfile.on('entry', (entry: yauzl.Entry) => {
                // Skip directories
                if (/\/$/.test(entry.fileName)) {
                    zipfile.readEntry();
                    return;
                }

                // Skip files that should be ignored
                if (shouldIgnoreFile(entry.fileName)) {
                    zipfile.readEntry();
                    return;
                }

                // Skip files larger than 1MB
                if (entry.uncompressedSize > MAX_FILE_SIZE) {
                    console.log(`Skipping large file: ${entry.fileName} (${entry.uncompressedSize} bytes)`);
                    zipfile.readEntry();
                    return;
                }

                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr) {
                        console.error(`Error reading ${entry.fileName}:`, streamErr);
                        zipfile.readEntry();
                        return;
                    }

                    if (!readStream) {
                        console.error(`No stream for ${entry.fileName}`);
                        zipfile.readEntry();
                        return;
                    }

                    const chunks: Buffer[] = [];

                    readStream.on('data', (chunk: Buffer) => {
                        chunks.push(chunk);
                    });

                    readStream.on('end', () => {
                        const buffer = Buffer.concat(chunks);
                        const mimetype = getFileType(entry.fileName);

                        files.push({
                            fieldname: 'file',
                            originalname: entry.fileName,
                            mimetype: mimetype,
                            buffer: buffer
                        });

                        zipfile.readEntry();
                    });

                    readStream.on('error', (readErr) => {
                        console.error(`Error reading stream for ${entry.fileName}:`, readErr);
                        zipfile.readEntry();
                    });
                });
            });

            zipfile.on('end', () => {
                console.log(`ZIP extraction complete: ${files.length} files extracted`);
                resolve(files);
            });

            zipfile.on('error', (zipErr) => {
                console.error('ZIP file error:', zipErr);
                reject(zipErr);
            });
        });
    });
}

async function processZipFromStorage(zipPath: string, fileName: string, projectName: string): Promise<UploadResponse> {
    console.log(`Processing ZIP file from Storage: ${zipPath}`);

    try {
        // Download ZIP file from Firebase Storage
        const bucket = admin.storage().bucket();
        const file = bucket.file(zipPath);

        console.log(`Downloading ZIP file from Storage: ${zipPath}`);
        const [zipBuffer] = await file.download();
        console.log(`Downloaded ZIP file, size: ${zipBuffer.length} bytes`);

        // Create a ProcessedFile object for the ZIP
        const zipFile: ProcessedFile = {
            fieldname: 'file',
            originalname: fileName,
            mimetype: 'application/zip',
            buffer: zipBuffer
        };

        // Process using existing ZIP processing logic
        const result = await processZipFile(zipFile, projectName);

        // Clean up the ZIP file from Storage
        try {
            await file.delete();
            console.log(`Cleaned up ZIP file from Storage: ${zipPath}`);
        } catch (deleteError) {
            console.warn(`Failed to delete ZIP file from Storage: ${deleteError}`);
        }

        return result;

    } catch (error) {
        console.error('Error processing ZIP from Storage:', error);
        throw new Error(`Failed to process ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// For local development, we'll use environment variables and exclude secrets
// For production deployment, we need to add secrets back to the configuration
const isProduction = process.env.NODE_ENV === 'production';

export const api = onRequest(
    {
        cors: true,
        maxInstances: 10,
        ...(isProduction && { secrets: [anthropicApiKey] })
    },
    async (req, res) => {
        // Set CORS headers explicitly
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, x-upload-type, x-project-name, x-file-name');

        // Handle preflight OPTIONS requests
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        const path = req.path;

        console.log(`API request: ${req.method} ${path}`);
        console.log('Full request URL:', req.url);
        console.log('Request path parts:', { path, originalUrl: req.originalUrl });

        try {
            if (path === '/upload' || path === '/api/upload') {
                if (req.method !== 'POST') {
                    res.status(405).json({ error: 'Method not allowed' });
                    return;
                }

                // Check content type to determine how to handle the request
                const contentType = req.headers['content-type'];

                if (contentType && contentType.includes('application/json')) {
                    // Handle GitHub URL upload as JSON
                    const body = req.body;
                    const uploadType = body.uploadType;
                    const projectName = body.projectName || 'Unnamed Project';

                    console.log(`JSON Upload request: uploadType="${uploadType}" for project "${projectName}"`);

                    if (uploadType === 'github') {
                        const githubUrl = body.githubUrl;
                        console.log(`GitHub repository upload: ${githubUrl}`);

                        if (!githubUrl) {
                            res.status(400).json({ error: 'GitHub URL is required' });
                            return;
                        }

                        // Validate GitHub URL format
                        const githubUrlRegex = /^https?:\/\/(www\.)?github\.com\/[\w\-\.]+\/[\w\-\.]+\/?$/;
                        if (!githubUrlRegex.test(githubUrl)) {
                            res.status(400).json({ error: 'Invalid GitHub URL format' });
                            return;
                        }

                        try {
                            const result = await cloneGitHubRepository(githubUrl, projectName);
                            
                            // If targetSessionId is provided, add the project to that session
                            const targetSessionId = body.targetSessionId;
                            if (targetSessionId && result.success) {
                                try {
                                    await addProjectToSession(targetSessionId, {
                                        name: result.projectName,
                                        files: result.files,
                                        droppedSummary: result.droppedSummary
                                    });
                                    console.log(`✅ GitHub project added to session: ${targetSessionId}`);
                                } catch (sessionError) {
                                    console.error(`❌ Failed to add GitHub project to session ${targetSessionId}:`, sessionError);
                                    // Don't fail the entire upload - just log the error
                                }
                            }
                            
                            res.json(result);
                            return;
                        } catch (error) {
                            console.error('GitHub cloning failed:', error);
                            res.status(500).json({
                                error: 'Failed to clone GitHub repository',
                                message: error instanceof Error ? error.message : 'Unknown error'
                            });
                            return;
                        }
                    } else if (uploadType === 'zip') {
                        const zipPath = body.zipPath;
                        const fileName = body.fileName || 'upload.zip';
                        console.log(`ZIP file upload from Storage: ${zipPath}`);

                        if (!zipPath) {
                            res.status(400).json({ error: 'ZIP path is required' });
                            return;
                        }

                        try {
                            const result = await processZipFromStorage(zipPath, fileName, projectName);
                            
                            // If targetSessionId is provided, add the project to that session
                            const targetSessionId = body.targetSessionId;
                            if (targetSessionId && result.success) {
                                try {
                                    await addProjectToSession(targetSessionId, {
                                        name: result.projectName,
                                        files: result.files,
                                        droppedSummary: result.droppedSummary
                                    });
                                    console.log(`✅ ZIP project added to session: ${targetSessionId}`);
                                } catch (sessionError) {
                                    console.error(`❌ Failed to add ZIP project to session ${targetSessionId}:`, sessionError);
                                    // Don't fail the entire upload - just log the error
                                }
                            }
                            
                            res.json(result);
                            return;
                        } catch (error) {
                            console.error('ZIP processing failed:', error);
                            res.status(500).json({
                                error: 'Failed to process ZIP file',
                                message: error instanceof Error ? error.message : 'Unknown error'
                            });
                            return;
                        }
                    }
                }

                // Handle multipart uploads (folder only - ZIP and GitHub use different methods)
                const { fields, files } = await processMultipartData(req);
                const projectName = fields.projectName || 'Unnamed Project';
                const uploadType = fields.uploadType;

                console.log(`Multipart Upload request: uploadType="${uploadType}" for project "${projectName}"`);

                // Only folder uploads should reach this point
                if (uploadType === 'zip') {
                    res.status(400).json({ error: 'ZIP uploads should use binary format, not multipart' });
                    return;
                }

                const clientFilterStats = fields.clientFilterStats;
                const targetSessionId = fields.targetSessionId;
                console.log(`File upload request: ${files.length} files for project "${projectName}"`);

                const result = await processUploadedFiles(files, projectName, clientFilterStats);
                
                // If targetSessionId is provided, add the project to that session
                if (targetSessionId && result.success) {
                    try {
                        await addProjectToSession(targetSessionId, {
                            name: result.projectName,
                            files: result.files,
                            droppedSummary: result.droppedSummary
                        });
                        console.log(`✅ Project added to session: ${targetSessionId}`);
                    } catch (sessionError) {
                        console.error(`❌ Failed to add project to session ${targetSessionId}:`, sessionError);
                        // Don't fail the entire upload - just log the error
                    }
                }
                
                res.json(result);

            } else if (path === '/claude' || path === '/api/claude') {
                if (req.method !== 'POST') {
                    res.status(405).json({ error: 'Method not allowed' });
                    return;
                }

                const requestData: ClaudeRequest = req.body;

                if (!requestData.prompt) {
                    res.status(400).json({ error: 'Prompt is required' });
                    return;
                }

                try {
                    const response = await callClaude(requestData.prompt, requestData.seed || 12345);
                    res.json({
                        success: true,
                        response: response.content,
                        usage: response.usage
                    });
                } catch (error) {
                    // Return fallback evaluation on API error
                    const fallbackResponse = {
                        summary: "API call failed - providing fallback evaluation.",
                        score: 5,
                        likes: ["Project structure appears organized", "Files are properly named"],
                        dislikes: ["Unable to perform detailed analysis due to API error"]
                    };

                    res.json({
                        success: true,
                        response: JSON.stringify(fallbackResponse),
                        usage: { input_tokens: 0, output_tokens: 0 },
                        warning: 'API call failed - using fallback evaluation'
                    });
                }

            } else if (path === '/api/download') {
                if (req.method !== 'POST') {
                    res.status(405).json({ error: 'Method not allowed' });
                    return;
                }

                const { projectName, files } = req.body;

                if (!files || !Array.isArray(files)) {
                    res.status(400).json({ error: 'Files array is required' });
                    return;
                }

                console.log(`Creating ZIP download for ${files.length} files`);

                // Create ZIP file
                const zipFile = new yazl.ZipFile();

                // Add README
                const readmeContent = `# ${projectName} - Processed Files

This ZIP contains the files that were sent to Claude AI for evaluation.

Generated: ${new Date().toISOString()}
Total Files: ${files.length}

Files included:
${files.map((f: ProjectFile) => `- ${f.path} (${f.type}, ${f.size} bytes)`).join('\n')}
`;
                zipFile.addBuffer(Buffer.from(readmeContent, 'utf-8'), 'README.md');

                // Add each file
                for (const file of files) {
                    try {
                        let buffer: Buffer;
                        if (file.type && (file.type.startsWith('text/') || file.type === 'application/json')) {
                            buffer = Buffer.from(file.content, 'utf-8');
                        } else {
                            buffer = Buffer.from(file.content, 'base64');
                        }

                        const cleanPath = file.path
                            .replace(/^\/+/, '')
                            .replace(/\.\./g, '__')
                            .replace(/\\/g, '/');

                        zipFile.addBuffer(buffer, cleanPath);
                    } catch (fileError) {
                        console.error(`Error adding file ${file.path} to ZIP:`, fileError);
                    }
                }

                zipFile.end();

                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', `attachment; filename="${projectName}-processed.zip"`);

                zipFile.outputStream.pipe(res);

            } else {
                res.status(404).json({ error: 'Not found' });
            }

        } catch (error) {
            console.error('API error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

// Helper function to add project to existing session
async function addProjectToSession(sessionId: string, project: any): Promise<void> {
    try {
        console.log(`📡 Adding project "${project.name}" to session: ${sessionId}`);
        
        // Get the current session
        const sessionRef = db.collection('sessions').doc(sessionId);
        const sessionDoc = await sessionRef.get();
        
        if (!sessionDoc.exists) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        const sessionData = sessionDoc.data();
        if (!sessionData) {
            throw new Error(`Session ${sessionId} has no data`);
        }
        
        // Check if session has expired
        if (Date.now() > sessionData.expiresAt) {
            throw new Error(`Session ${sessionId} has expired`);
        }
        
        // Add the project to the session's projects array
        const currentProjects = sessionData.projects || [];
        currentProjects.push(project);
        
        // Update the session
        await sessionRef.update({
            projects: currentProjects,
            updatedAt: Date.now()
        });
        
        console.log(`✅ Successfully added project to session ${sessionId}. Total projects: ${currentProjects.length}`);
        
    } catch (error) {
        console.error(`❌ Error adding project to session ${sessionId}:`, error);
        throw error;
    }
}

// Cleanup function to delete expired sessions
export const cleanupExpiredSessions = onSchedule('every 24 hours', async (event) => {
    console.log('🧹 Starting cleanup of expired sessions...');
    
    try {
        const now = Date.now();
        const sessionsRef = db.collection('sessions');
        
        // Query for expired sessions
        const expiredSessionsQuery = sessionsRef.where('expiresAt', '<', now);
        const expiredSnapshot = await expiredSessionsQuery.get();
        
        if (expiredSnapshot.empty) {
            console.log('✅ No expired sessions found');
            return;
        }
        
        console.log(`🗑️ Found ${expiredSnapshot.size} expired sessions to delete`);
        
        // Delete expired sessions in batches
        const batch = db.batch();
        let deleteCount = 0;
        
        expiredSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
            deleteCount++;
            
            // Firestore batch limit is 500 operations
            if (deleteCount >= 500) {
                return;
            }
        });
        
        await batch.commit();
        
        console.log(`✅ Successfully deleted ${deleteCount} expired sessions`);
        
        // If there were more than 500, log that more cleanup is needed
        if (expiredSnapshot.size > 500) {
            console.log(`⚠️ ${expiredSnapshot.size - 500} more expired sessions remain (will be cleaned up in next run)`);
        }
        
    } catch (error) {
        console.error('❌ Error during session cleanup:', error);
    }
});