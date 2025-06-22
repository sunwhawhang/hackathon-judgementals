import { createServer, IncomingMessage, ServerResponse } from 'http';
import { promises as fs } from 'fs';
import { parse } from 'url';
import { Anthropic } from '@anthropic-ai/sdk';
import multer, { FileFilterCallback } from 'multer';
import { dirname, join, extname } from 'path';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';

// Extended request type for multer
interface MulterRequest extends IncomingMessage {
    body?: Record<string, string>;
    files?: {
        files?: Express.Multer.File[];
        zipFile?: Express.Multer.File[];
        [fieldname: string]: Express.Multer.File[] | undefined;
    };
}

interface ClaudeRequest {
    prompt: string;
    seed: number;
}

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

interface DownloadRequest {
    projectName: string;
    files: ProjectFile[];
}

interface MulterFile extends Express.Multer.File {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
    fieldname: string;
    encoding: string;
}

interface MulterError extends Error {
    code: string;
    field?: string;
    storageErrors?: Error[];
}

class HackathonServer {
    private anthropic: Anthropic;
    private readonly port = 3001;
    private upload: multer.Multer;
    
    // File filtering constants
    private readonly IGNORED_DIRECTORIES = [
        // Package managers and dependencies
        'node_modules', 'bower_components', 'vendor', 'packages', 'deps', 'dependencies',
        // Version control and git
        '.git', '.svn', '.hg', '.bzr',
        // Build outputs and compiled files
        'dist', 'build', 'target', 'bin', 'obj', 'out', 'lib', 'libs', '.next',
        // Python environments and cache
        '__pycache__', '.venv', 'venv', 'env', '.env', '.pytest_cache',
        // Test coverage and reports
        'coverage', '.nyc_output', '.coverage', 'htmlcov',
        // Build tools and IDEs
        '.gradle', '.mvn', '.idea', '.vscode', '.vs',
        // Temporary and cache directories
        'tmp', 'temp', 'cache', '.cache', '.tmp',
        // Platform specific
        '.DS_Store', 'Thumbs.db',
        // Other common directories to ignore
        'logs', '.sass-cache', '.nuxt', '.output'
    ];
    
    private readonly IGNORED_EXTENSIONS = [
        '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib',
        '.class', '.jar', '.war', '.ear', '.deb', '.rpm', '.dmg', '.iso',
        '.mp4', '.avi', '.mov', '.wmv', '.mp3', '.wav', '.flac', '.aac',
        '.min.js', '.min.css', '.bundle.js', '.chunk.js', '.woff', '.woff2',
        '.ttf', '.eot', '.map', '.lock',
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.svg', '.webp',
        '.ico', '.cur', '.psd', '.ai', '.sketch', '.fig'
    ];
    
    private readonly MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
    private readonly MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total per project
    private readonly CLAUDE_TEXT_LIMIT = 8 * 1024 * 1024; // 8MB for Claude API (conservative limit)

    constructor() {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error('❌ ANTHROPIC_API_KEY environment variable is required');
            process.exit(1);
        }
        
        this.anthropic = new Anthropic({
            apiKey: apiKey
        });
        
        // Configure multer for file uploads - supports both folders and ZIP files
        this.upload = multer({
            storage: multer.memoryStorage(),
            limits: {
                fileSize: 100 * 1024 * 1024, // 100MB for ZIP files, 10MB for individual files
                files: 1500, // Max 1500 files (client sends max 1000)
                parts: 2000, // More parts for form fields
                fieldSize: 1024 * 1024 // 1MB field size
            },
            fileFilter: (req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
                // Allow ZIP files or filter individual files
                if (file.fieldname === 'zipFile' || !this.shouldIgnoreFile(file.originalname)) {
                    cb(null, true);
                } else {
                    console.log(`🚫 Ignoring file: ${file.originalname}`);
                    cb(null, false);
                }
            }
        });
        
        console.log('🚀 Hackathon server initialized');
    }

    private shouldIgnoreFile(filepath: string): boolean {
        const filename = filepath.toLowerCase();
        const pathParts = filepath.split('/');
        
        // Check if any directory in the path should be ignored (including hidden directories)
        for (const part of pathParts) {
            const lowerPart = part.toLowerCase();
            
            // Ignore any directory starting with . (hidden directories)
            if (part.startsWith('.') && part !== '.' && part !== '..') {
                // Allow specific important dotfiles/folders
                const allowedDotFiles = ['.env.example', '.gitignore', '.github', '.gitattributes', '.editorconfig'];
                if (!allowedDotFiles.includes(part)) {
                    return true;
                }
            }
            
            // Check against explicit ignore list
            if (this.IGNORED_DIRECTORIES.includes(lowerPart)) {
                return true;
            }
        }
        
        // Check file extension
        const ext = extname(filename);
        if (this.IGNORED_EXTENSIONS.includes(ext)) {
            return true;
        }
        
        // Ignore hidden files (starting with .) but allow important dotfiles
        const basename = pathParts[pathParts.length - 1];
        if (basename.startsWith('.')) {
            const allowedDotFiles = ['.env.example', '.gitignore', '.gitattributes', '.editorconfig', '.babelrc', '.eslintrc', '.prettierrc'];
            if (!allowedDotFiles.some(allowed => basename.startsWith(allowed.split('.')[1]))) {
                return true;
            }
        }
        
        return false;
    }

    private async extractZipFile(zipBuffer: Buffer): Promise<ProjectFile[]> {
        const startTime = Date.now();
        console.log(`📦 Starting ZIP extraction, size: ${(zipBuffer.length / 1024 / 1024).toFixed(2)}MB`);
        
        return new Promise((resolve, reject) => {
            const extractedFiles: ProjectFile[] = [];
            let entriesProcessed = 0;
            let totalEntries = 0;
            
            yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipFile) => {
                if (err) {
                    console.error('❌ Error opening ZIP file:', err);
                    reject(err);
                    return;
                }
                
                if (!zipFile) {
                    reject(new Error('Invalid ZIP file'));
                    return;
                }
                
                totalEntries = zipFile.entryCount;
                console.log(`📊 ZIP contains ${totalEntries} entries`);
                
                zipFile.readEntry();
                
                zipFile.on('entry', (entry) => {
                    entriesProcessed++;
                    
                    // Log progress every 1000 entries
                    if (entriesProcessed % 1000 === 0) {
                        console.log(`📄 Processing ZIP entry ${entriesProcessed}/${totalEntries}: ${entry.fileName}`);
                    }
                    
                    // Skip directories
                    if (/\/$/.test(entry.fileName)) {
                        zipFile.readEntry();
                        return;
                    }
                    
                    // Filter files based on path and size
                    if (this.shouldIgnoreFile(entry.fileName)) {
                        zipFile.readEntry();
                        return;
                    }
                    
                    // Skip files larger than 1MB
                    if (entry.uncompressedSize > this.MAX_FILE_SIZE) {
                        console.log(`⚠️  Skipping large file in ZIP: ${entry.fileName} (${(entry.uncompressedSize / 1024 / 1024).toFixed(2)}MB)`);
                        zipFile.readEntry();
                        return;
                    }
                    
                    // Extract file content
                    zipFile.openReadStream(entry, (err, readStream) => {
                        if (err) {
                            console.error(`❌ Error reading ${entry.fileName}:`, err);
                            zipFile.readEntry();
                            return;
                        }
                        
                        if (!readStream) {
                            zipFile.readEntry();
                            return;
                        }
                        
                        const chunks: Buffer[] = [];
                        readStream.on('data', (chunk) => chunks.push(chunk));
                        readStream.on('end', () => {
                            try {
                                const buffer = Buffer.concat(chunks);
                                const isTextFile = this.isTextFile(entry.fileName);
                                
                                const content = isTextFile ? 
                                    buffer.toString('utf-8') : 
                                    buffer.toString('base64');
                                
                                extractedFiles.push({
                                    name: entry.fileName,
                                    content,
                                    type: this.getFileType(entry.fileName),
                                    size: buffer.length,
                                    path: entry.fileName
                                });
                                
                                console.log(`✅ Extracted: ${entry.fileName} (${extractedFiles.length} files total)`);
                                
                                // Stop if we have enough files
                                if (extractedFiles.length >= 1000) {
                                    console.log(`⚠️  Reached file limit, stopping extraction at ${extractedFiles.length} files`);
                                    zipFile.close();
                                    return;
                                }
                                
                                zipFile.readEntry();
                            } catch (error) {
                                console.error(`❌ Error processing ${entry.fileName}:`, error);
                                zipFile.readEntry();
                            }
                        });
                        
                        readStream.on('error', (err) => {
                            console.error(`❌ Stream error for ${entry.fileName}:`, err);
                            zipFile.readEntry();
                        });
                    });
                });
                
                zipFile.on('end', () => {
                    const processingTime = Date.now() - startTime;
                    console.log(`✅ ZIP extraction completed in ${processingTime}ms: ${extractedFiles.length} files extracted`);
                    resolve(extractedFiles);
                });
                
                zipFile.on('error', (err) => {
                    console.error('❌ ZIP file error:', err);
                    reject(err);
                });
            });
        });
    }

    private async handleCORS(res: ServerResponse): Promise<void> {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    private async readBody(req: IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', reject);
        });
    }

    private async processUploadedFiles(files: Express.Multer.File[], projectName: string, clientFilterStats?: string): Promise<UploadResponse> {
        const startTime = Date.now();
        console.log(`📁 Processing ${files.length} files for project: ${projectName}`);
        console.log(`📊 Memory usage before processing: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        
        const processedFiles: ProjectFile[] = [];
        let totalSize = 0;
        let skippedFiles = 0;
        let filteredFiles = 0;
        
        // Track dropped files for summary
        const droppedFolders = new Set<string>();
        const droppedIndividualFiles: string[] = [];
        const oversizedFiles: { name: string, size: number }[] = [];
        
        // First pass: log all files and filter
        console.log(`🔍 First pass: filtering and logging files...`);
        const validFiles: Express.Multer.File[] = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                console.log(`📄 File ${i + 1}/${files.length}: ${file.originalname} (${(file.buffer.length / 1024).toFixed(1)}KB, ${file.mimetype || 'unknown type'})`);
                
                // Check if file should be ignored based on path/name
                if (this.shouldIgnoreFile(file.originalname)) {
                    console.log(`🚫 Filtered out: ${file.originalname} (matches ignore rules)`);
                    filteredFiles++;
                    
                    // Track dropped folders and files
                    const pathParts = file.originalname.split('/');
                    let foundFolder = false;
                    for (const part of pathParts) {
                        if (this.IGNORED_DIRECTORIES.includes(part.toLowerCase())) {
                            droppedFolders.add(part);
                            foundFolder = true;
                            break;
                        }
                    }
                    
                    // If not a known folder, track as individual file
                    if (!foundFolder && !file.originalname.includes('/')) {
                        droppedIndividualFiles.push(file.originalname);
                    }
                    continue;
                }
                
                // Skip individual files that are too large
                if (file.buffer.length > this.MAX_FILE_SIZE) {
                    console.log(`⚠️  Skipping ${file.originalname} - file size ${(file.buffer.length / 1024 / 1024).toFixed(2)}MB exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
                    oversizedFiles.push({
                        name: file.originalname,
                        size: file.buffer.length
                    });
                    skippedFiles++;
                    continue;
                }
                
                // Skip if adding this file would exceed total size limit
                if (totalSize + file.buffer.length > this.MAX_TOTAL_SIZE) {
                    console.log(`⚠️  Skipping ${file.originalname} - would exceed total size limit of ${this.MAX_TOTAL_SIZE / 1024 / 1024}MB`);
                    skippedFiles++;
                    continue;
                }
                
                validFiles.push(file);
                totalSize += file.buffer.length;
                
            } catch (error) {
                console.error(`❌ Error during filtering for file ${file.originalname}:`, error);
                skippedFiles++;
            }
        }
        
        console.log(`✅ Filtering complete: ${validFiles.length} valid files, ${filteredFiles} filtered, ${skippedFiles} skipped`);
        console.log(`📊 Estimated total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
        
        // Reset totalSize for actual processing
        totalSize = 0;
        
        // Second pass: process valid files
        console.log(`🔄 Second pass: processing valid files...`);
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            try {
                console.log(`⚙️  Processing file ${i + 1}/${validFiles.length}: ${file.originalname}`);
                console.log(`🔍 File path info:`, {
                    originalname: file.originalname,
                    fieldname: file.fieldname,
                    mimetype: file.mimetype,
                    encoding: file.encoding,
                    keys: Object.keys(file)
                });
                
                let content: string;
                const isTextFile = this.isTextFile(file.originalname, file.mimetype);
                console.log(`📝 File type detected: ${isTextFile ? 'text' : 'binary'}`);
                
                if (isTextFile) {
                    content = file.buffer.toString('utf-8');
                    console.log(`📄 Text file processed: ${content.length} characters`);
                } else {
                    // For binary files, store as base64
                    content = file.buffer.toString('base64');
                    console.log(`🔢 Binary file processed: ${content.length} base64 characters`);
                }
                
                processedFiles.push({
                    name: file.originalname,
                    content,
                    type: file.mimetype || this.getFileType(file.originalname),
                    size: file.buffer.length,
                    path: file.originalname
                });
                
                totalSize += file.buffer.length;
                console.log(`✅ File added: ${file.originalname} (${processedFiles.length}/${validFiles.length} completed)`);
                
                // Log memory usage every 10 files
                if (i % 10 === 0) {
                    console.log(`📊 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
                }
                
            } catch (error) {
                console.error(`❌ Error processing file ${file.originalname}:`, error);
                console.error(`❌ Error details:`, (error as Error).message, (error as Error).stack?.split('\n')[0]);
                skippedFiles++;
            }
        }
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ Processed ${processedFiles.length} files in ${processingTime}ms`);
        console.log(`📊 Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
        if (skippedFiles > 0) {
            console.log(`⚠️  Skipped ${skippedFiles} files`);
        }
        
        const warnings: string[] = [];
        const droppedSummary: string[] = [];
        
        // Parse client-side filtering stats if provided
        let clientStats: ClientFilterStats | null = null;
        if (clientFilterStats) {
            try {
                clientStats = JSON.parse(clientFilterStats);
                console.log(`📊 Client-side filtering stats:`, clientStats);
            } catch (error) {
                console.error(`❌ Error parsing client filter stats:`, error);
            }
        }
        
        // Calculate total files excluded
        let totalFilesExcluded = filteredFiles + skippedFiles;
        let totalOriginalFiles = files.length;
        
        if (clientStats) {
            totalFilesExcluded += (clientStats.filteredCount || 0);
            totalOriginalFiles = clientStats.totalFiles || files.length;
        }
        
        // Add overall summary if significant filtering occurred
        if (totalFilesExcluded > 0) {
            const excludedCount = totalFilesExcluded.toLocaleString();
            const originalCount = totalOriginalFiles.toLocaleString();
            const finalCount = processedFiles.length.toLocaleString();
            
            if (totalOriginalFiles > 1000) {
                droppedSummary.unshift(`📊 Processing Summary: ${excludedCount} files were excluded during processing (${originalCount} → ${finalCount} files)`);
            } else {
                droppedSummary.unshift(`📊 Processing Summary: ${excludedCount} files excluded from ${originalCount} total files`);
            }
        }
        
        if (skippedFiles > 0) {
            warnings.push(`${skippedFiles} files were skipped due to size limits`);
        }
        
        // Create detailed dropped files summary
        if (droppedFolders.size > 0) {
            droppedSummary.push(`📁 Server-excluded folders: ${Array.from(droppedFolders).join(', ')}`);
        }
        
        if (droppedIndividualFiles.length > 0) {
            let filesHtml = '<details><summary>📄 Server-excluded files</summary>';
            for (const file of droppedIndividualFiles) {
                filesHtml += `<br>- ${file}`;
            }
            filesHtml += '</details>';
            droppedSummary.push(filesHtml);
        }
        
        if (oversizedFiles.length > 0) {
            let oversizedHtml = '<details><summary>📦 Server-excluded oversized files</summary>';
            for (const f of oversizedFiles) {
                oversizedHtml += `<br>- ${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`;
            }
            oversizedHtml += '</details>';
            droppedSummary.push(oversizedHtml);
        }
        
        // Add client-side filtering details if available
        if (clientStats && clientStats.filteredCount > 0) {
            const clientFilteredCount = clientStats.filteredCount.toLocaleString();
            const filterRatio = clientStats.filterRatio || ((clientStats.filteredCount / clientStats.totalFiles) * 100).toFixed(1);
            droppedSummary.push(`🔍 Client-side filtering: ${clientFilteredCount} files filtered before upload (${filterRatio}% reduction)`);
            
            // Add specific folder names that were dropped (no limits)
            if (clientStats.droppedFolders && clientStats.droppedFolders.length > 0) {
                droppedSummary.push(`📁 Client-excluded folders: ${clientStats.droppedFolders.join(', ')}`);
            }
            
            // Generate expandable directory-based file listings
            if (clientStats.filesByDirectory && Object.keys(clientStats.filesByDirectory).length > 0) {
                let directoriesHtml = '<details><summary>📁 Dropped Files by Directory</summary>';
                
                for (const [directory, files] of Object.entries(clientStats.filesByDirectory)) {
                    const fileArray = files as string[];
                    directoriesHtml += `
<details><summary>📁 ${directory} ▶ (${fileArray.length} files)</summary>`;
                    
                    for (const file of fileArray) {
                        directoriesHtml += `<br>- ${file}`;
                    }
                    
                    directoriesHtml += '</details>';
                }
                
                directoriesHtml += '</details>';
                droppedSummary.push(directoriesHtml);
            } else if (clientStats.droppedFiles && clientStats.droppedFiles.length > 0) {
                // Fallback to simple list if filesByDirectory not available
                let filesHtml = '<details><summary>📄 Client-excluded files</summary>';
                for (const file of clientStats.droppedFiles) {
                    filesHtml += `<br>- ${file}`;
                }
                filesHtml += '</details>';
                droppedSummary.push(filesHtml);
            }
            
            // Add all oversized files without truncation
            if (clientStats.oversizedFiles && clientStats.oversizedFiles.length > 0) {
                let oversizedHtml = '<details><summary>📦 Client-excluded oversized files</summary>';
                for (const f of clientStats.oversizedFiles) {
                    oversizedHtml += `<br>- ${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`;
                }
                oversizedHtml += '</details>';
                droppedSummary.push(oversizedHtml);
            }
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

    private isTextFile(filename: string, mimetype?: string): boolean {
        // Check mimetype first
        if (mimetype) {
            if (mimetype.startsWith('text/') || 
                mimetype === 'application/json' ||
                mimetype === 'application/javascript' ||
                mimetype === 'application/xml') {
                return true;
            }
        }
        
        // Check file extension
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

    private getFileType(filename: string): string {
        const ext = extname(filename.toLowerCase());
        const typeMap: { [key: string]: string } = {
            '.js': 'text/javascript',
            '.ts': 'text/typescript',
            '.jsx': 'text/javascript',
            '.tsx': 'text/typescript',
            '.py': 'text/python',
            '.java': 'text/java',
            '.cpp': 'text/cpp',
            '.c': 'text/c',
            '.h': 'text/c',
            '.hpp': 'text/cpp',
            '.cs': 'text/csharp',
            '.php': 'text/php',
            '.rb': 'text/ruby',
            '.go': 'text/go',
            '.rs': 'text/rust',
            '.swift': 'text/swift',
            '.kt': 'text/kotlin',
            '.html': 'text/html',
            '.css': 'text/css',
            '.scss': 'text/scss',
            '.json': 'application/json',
            '.xml': 'application/xml',
            '.yaml': 'text/yaml',
            '.yml': 'text/yaml',
            '.md': 'text/markdown',
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
        };
        return typeMap[ext] || 'application/octet-stream';
    }

    private async callClaude(prompt: string, seed: number): Promise<any> {
        const startTime = Date.now();
        console.log(`🤖 Calling Claude API (seed: ${seed})`);
        
        try {
            const response = await this.anthropic.messages.create({
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

            const processingTime = Date.now() - startTime;
            console.log(`✅ Claude API responded in ${processingTime}ms`);

            return {
                content: response.content[0].type === 'text' ? response.content[0].text : '',
                usage: response.usage
            };
        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`❌ Claude API error after ${processingTime}ms:`, error);
            throw error;
        }
    }

    private async handleUpload(req: MulterRequest, res: ServerResponse): Promise<void> {
        const startTime = Date.now();
        console.log(`📤 Upload request received from ${req.headers['user-agent'] || 'unknown client'}`);
        console.log(`📊 Initial memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        console.log(`🌐 Request headers:`, JSON.stringify({
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length'],
            'origin': req.headers['origin']
        }, null, 2));
        
        try {
            if (req.method === 'OPTIONS') {
                console.log(`✅ Handling CORS preflight request`);
                await this.handleCORS(res);
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.method !== 'POST') {
                console.log(`❌ Invalid method: ${req.method}`);
                res.writeHead(405, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
            }

            console.log(`🔄 Setting CORS headers and processing POST request`);
            await this.handleCORS(res);

            // Use multer to handle the multipart form data
            console.log(`🔄 Starting multer file processing...`);
            const uploadHandler = this.upload.fields([
                { name: 'files' }, 
                { name: 'projectName' }, 
                { name: 'uploadType' }, 
                { name: 'clientFilterStats' },
                { name: 'zipFile' }
            ]);
            
            let multerSkippedFiles = 0;
            const multerStartTime = Date.now();
            
            await new Promise<void>((resolve, reject) => {
                uploadHandler(req as any, res as any, (err: any) => {
                    const multerTime = Date.now() - multerStartTime;
                    console.log(`⏱️  Multer processing completed in ${multerTime}ms`);
                    
                    if (err) {
                        console.error(`❌ Multer error:`, err);
                        console.error(`❌ Error code: ${err.code}, message: ${err.message}`);
                        
                        // Handle multer errors gracefully - don't reject, just log and continue
                        if (err.code === 'LIMIT_FILE_SIZE') {
                            console.log(`⚠️  Multer skipped large file - exceeds ${100}MB limit`);
                            multerSkippedFiles++;
                            resolve(); // Continue processing with files that were uploaded
                        } else if (err.code === 'LIMIT_FILE_COUNT') {
                            console.log(`⚠️  Too many files, processing first 2000 files only`);
                            resolve(); // Continue with processed files
                        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                            console.log(`⚠️  Unexpected file field, ignoring`);
                            resolve(); // Continue processing
                        } else {
                            console.error('❌ Unhandled multer error:', err);
                            resolve(); // Even for unexpected errors, try to continue
                        }
                    } else {
                        console.log(`✅ Multer processing successful`);
                        resolve();
                    }
                });
            });
            
            console.log(`📊 Memory usage after multer: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

            const files = req.files?.files || [];
            const zipFiles = req.files?.zipFile || [];
            const projectName = req.body?.projectName || 'Unnamed Project';
            const uploadType = req.body?.uploadType || 'folder';
            const clientFilterStats = req.body?.clientFilterStats;
            
            console.log(`📋 Extracted data: project="${projectName}", uploadType="${uploadType}"`);
            console.log(`📊 Files: ${files.length}, ZIP files: ${zipFiles.length}`);
            if (clientFilterStats) {
                console.log(`📊 Client filter stats received: ${clientFilterStats.substring(0, 200)}...`);
            }

            let result: UploadResponse;

            if (uploadType === 'zip' && zipFiles.length > 0) {
                // Handle ZIP upload
                const zipFile = zipFiles[0];
                console.log(`📦 Processing ZIP file: ${zipFile.originalname} (${(zipFile.buffer.length / 1024 / 1024).toFixed(2)}MB)`);
                
                try {
                    const extractedFiles = await this.extractZipFile(zipFile.buffer);
                    
                    result = {
                        success: true,
                        projectName,
                        files: extractedFiles,
                        skippedFiles: 0,
                        totalSize: extractedFiles.reduce((sum, f) => sum + f.size, 0),
                        warnings: [`Extracted ${extractedFiles.length} files from ZIP archive`]
                    };
                    
                    console.log(`✅ ZIP processing completed: ${extractedFiles.length} files`);
                } catch (error) {
                    console.error('❌ ZIP extraction failed:', error);
                    throw new Error(`ZIP extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            } else {
                // Handle folder upload
                if (!files || files.length === 0) {
                    console.log(`❌ No files found in upload`);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'No files uploaded' 
                    }));
                    return;
                }

                console.log(`🔄 Starting folder file processing for ${files.length} files...`);
                result = await this.processUploadedFiles(files, projectName, clientFilterStats);
                console.log(`✅ Folder file processing completed successfully`);
            }
            
            // Add multer skipped files to the total
            if (multerSkippedFiles > 0) {
                result.skippedFiles = (result.skippedFiles || 0) + multerSkippedFiles;
                if (!result.warnings) result.warnings = [];
                result.warnings.push(`${multerSkippedFiles} extremely large files were skipped during upload`);
            }
            
            const totalTime = Date.now() - startTime;
            console.log(`🎉 Upload completed in ${totalTime}ms`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ Upload error after ${totalTime}ms:`, error);
            console.error(`❌ Error type: ${(error as Error).constructor.name}`);
            console.error(`❌ Error message: ${(error as Error).message}`);
            console.error(`❌ Error stack: ${(error as Error).stack?.split('\n').slice(0, 3).join('\n')}`);
            console.log(`📊 Memory usage during error: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            
            // Even if upload fails, try to return whatever we can
            try {
                console.log(`🔄 Attempting error recovery...`);
                const files = (req as any).files?.files || [];
                const projectName = (req as any).body?.projectName || 'Failed Upload';
                const clientFilterStats = (req as any).body?.clientFilterStats;
                
                console.log(`🔍 Recovery attempt: found ${files.length} files`);
                
                if (files.length > 0) {
                    console.log(`🔄 Attempting partial recovery with ${files.length} files`);
                    const result = await this.processUploadedFiles(files, projectName, clientFilterStats);
                    result.warnings = result.warnings || [];
                    result.warnings.push('Upload encountered errors but partial processing completed');
                    
                    console.log(`✅ Partial recovery successful: ${result.files.length} files processed`);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } else {
                    // Complete failure - return empty project
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: true,
                        projectName: 'Empty Project',
                        files: [],
                        warnings: ['Upload failed - no files could be processed'],
                        error: 'Upload failed but handled gracefully'
                    }));
                }
            } catch (recoveryError) {
                console.error(`❌ Recovery also failed:`, recoveryError);
                // Final fallback - always return success with empty project
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true,
                    projectName: 'Empty Project',
                    files: [],
                    warnings: ['Complete upload failure - returning empty project'],
                    error: 'All recovery attempts failed'
                }));
            }
        }
    }

    private async handleClaudeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const startTime = Date.now();
        console.log(`🤖 Claude API request received`);
        
        try {
            if (req.method === 'OPTIONS') {
                await this.handleCORS(res);
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.method !== 'POST') {
                res.writeHead(405, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
            }

            await this.handleCORS(res);
            
            const body = await this.readBody(req);
            const requestData: ClaudeRequest = JSON.parse(body);

            if (!requestData.prompt) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Prompt is required' }));
                return;
            }

            const response = await this.callClaude(requestData.prompt, requestData.seed || 12345);
            
            const totalTime = Date.now() - startTime;
            console.log(`✅ Claude request completed in ${totalTime}ms`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true, 
                response: response.content,
                usage: response.usage 
            }));

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ Claude request failed after ${totalTime}ms:`, error);
            
            // Always return a successful response with a fallback evaluation
            const fallbackResponse = {
                summary: "API call failed - providing fallback evaluation. Unable to perform detailed AI analysis at this time.",
                score: 5, // Neutral score
                likes: [
                    "Project structure appears organized",
                    "Files are properly named and categorized",
                    "Code appears to follow standard conventions"
                ],
                dislikes: [
                    "Unable to perform detailed code analysis due to API error",
                    "Could not evaluate technical implementation specifics",
                    "Limited assessment available due to system constraints"
                ]
            };
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true, 
                response: JSON.stringify(fallbackResponse),
                usage: { input_tokens: 0, output_tokens: 0 },
                warning: 'API call failed - using fallback evaluation'
            }));
        }
    }

    private async handleDownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const startTime = Date.now();
        console.log(`📥 Download request received`);
        
        try {
            if (req.method === 'OPTIONS') {
                await this.handleCORS(res);
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.method !== 'POST') {
                res.writeHead(405, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
            }

            await this.handleCORS(res);
            
            const body = await this.readBody(req);
            const requestData = JSON.parse(body) as DownloadRequest;

            if (!requestData.files || !Array.isArray(requestData.files)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Files array is required' }));
                return;
            }

            const projectName = requestData.projectName || 'processed-project';
            const files = requestData.files;
            
            console.log(`📦 Creating actual ZIP file for download: ${files.length} files`);
            
            // Create a proper ZIP file with the actual files that were processed
            const zipFile = new yazl.ZipFile();
            let filesAdded = 0;
            
            // Add a README explaining what this contains
            const readmeContent = `# ${projectName} - Processed Files

This ZIP contains the exact files that were sent to Claude AI for evaluation.

Generated: ${new Date().toISOString()}
Total Files: ${files.length}

Files included:
${files.map((f: any) => `- ${f.path} (${f.type}, ${f.size} bytes)`).join('\n')}

Note: These are the filtered and processed files after removing:
- Large files (>1MB)
- Binary files (images, videos, etc.)
- Build artifacts (node_modules, dist, build folders)
- Hidden files and directories
`;
            
            zipFile.addBuffer(Buffer.from(readmeContent, 'utf-8'), 'README.md');
            
            // Add each actual file with its real content
            for (const file of files) {
                try {
                    let buffer: Buffer;
                    
                    if (file.type && (file.type.startsWith('text/') || 
                        file.type === 'application/json' ||
                        file.name.endsWith('.js') ||
                        file.name.endsWith('.ts') ||
                        file.name.endsWith('.py') ||
                        file.name.endsWith('.html') ||
                        file.name.endsWith('.css') ||
                        file.name.endsWith('.md'))) {
                        // Text file - use content directly
                        buffer = Buffer.from(file.content, 'utf-8');
                    } else {
                        // Binary file - decode from base64
                        buffer = Buffer.from(file.content, 'base64');
                    }
                    
                    // Preserve folder structure - only clean dangerous paths
                    const cleanPath = file.path
                        .replace(/^\/+/, '')  // Remove leading slashes
                        .replace(/\.\./g, '__')  // Replace .. with __ for safety
                        .replace(/\\/g, '/');  // Normalize path separators
                    
                    console.log(`📄 Adding to ZIP: ${file.path} -> ${cleanPath}`);
                    zipFile.addBuffer(buffer, cleanPath);
                    filesAdded++;
                    
                    console.log(`✅ Added to ZIP: ${cleanPath} (${buffer.length} bytes)`);
                } catch (fileError) {
                    console.error(`❌ Error adding file ${file.path} to ZIP:`, fileError);
                    // Continue with other files
                }
            }
            
            console.log(`✅ Added ${filesAdded}/${files.length} files to ZIP`);
            
            // Finalize the ZIP and stream to response
            zipFile.end();
            
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${projectName}-processed.zip"`,
                'Transfer-Encoding': 'chunked'
            });
            
            // Stream the ZIP directly to the response
            zipFile.outputStream.pipe(res);
            
            zipFile.outputStream.on('end', () => {
                const totalTime = Date.now() - startTime;
                console.log(`✅ ZIP download completed in ${totalTime}ms`);
            });
            
            zipFile.outputStream.on('error', (error) => {
                console.error('❌ ZIP stream error:', error);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('ZIP creation failed');
                }
            });

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ Download error after ${totalTime}ms:`, error);
            
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'Download failed',
                    message: error instanceof Error ? error.message : 'Unknown error'
                }));
            }
        }
    }

    private async handleStaticFiles(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const parsedUrl = parse(req.url || '');
        let pathname = parsedUrl.pathname || '/';
        
        // Default to index.html for root path
        if (pathname === '/') {
            pathname = '/index.html';
        }

        const filePath = `.${pathname}`;
        
        try {
            const content = await fs.readFile(filePath);
            let contentType = 'text/html';
            
            if (pathname.endsWith('.js')) {
                contentType = 'application/javascript';
            } else if (pathname.endsWith('.css')) {
                contentType = 'text/css';
            } else if (pathname.endsWith('.json')) {
                contentType = 'application/json';
            }
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
        }
    }

    public start(): void {
        const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
            const parsedUrl = parse(req.url || '');
            const pathname = parsedUrl.pathname;
            
            // Set request timeout to 5 minutes for large uploads
            req.setTimeout(5 * 60 * 1000, () => {
                console.log('⏰ Request timeout after 5 minutes');
                if (!res.headersSent) {
                    res.writeHead(408, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Request timeout - file processing took too long'
                    }));
                }
            });
            
            try {
                if (pathname === '/api/upload') {
                    await this.handleUpload(req as MulterRequest, res);
                } else if (pathname === '/api/claude') {
                    await this.handleClaudeRequest(req, res);
                } else if (pathname === '/api/download') {
                    await this.handleDownload(req, res);
                } else {
                    await this.handleStaticFiles(req, res);
                }
            } catch (error) {
                console.error(`❌ Unhandled server error for ${pathname}:`, error);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: 'Internal server error',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }));
                }
            }
        });

        // Set server timeout settings for large uploads
        server.timeout = 5 * 60 * 1000; // 5 minutes
        server.keepAliveTimeout = 65000; // 65 seconds  
        server.headersTimeout = 66000; // 66 seconds

        server.listen(this.port, () => {
            console.log(`🚀 Hackathon Judgementals server running at http://localhost:${this.port}`);
            console.log(`📋 Make sure to set your ANTHROPIC_API_KEY environment variable`);
            console.log(`🎯 API endpoints:`);
            console.log(`   📤 Upload: http://localhost:${this.port}/api/upload`);
            console.log(`   🤖 Claude: http://localhost:${this.port}/api/claude`);
        });
    }
}

// Start the server
const server = new HackathonServer();
server.start();