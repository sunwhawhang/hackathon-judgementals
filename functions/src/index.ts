import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Anthropic } from '@anthropic-ai/sdk';
import Busboy from 'busboy';
import { extname } from 'path';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';

// Initialize Firebase Admin
admin.initializeApp();

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

// Initialize Anthropic
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || ''
});

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

async function processMultipartData(req: any): Promise<{ fields: any; files: any[] }> {
    return new Promise((resolve, reject) => {
        const fields: any = {};
        const files: any[] = [];
        
        const bb = Busboy({ headers: req.headers });
        
        bb.on('field', (name: string, val: string) => {
            fields[name] = val;
        });
        
        bb.on('file', (name: string, file: any, info: any) => {
            const chunks: Buffer[] = [];
            
            file.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });
            
            file.on('end', () => {
                files.push({
                    fieldname: name,
                    originalname: info.filename,
                    mimetype: info.mimeType,
                    buffer: Buffer.concat(chunks)
                });
            });
        });
        
        bb.on('finish', () => {
            resolve({ fields, files });
        });
        
        bb.on('error', reject);
        
        req.pipe(bb);
    });
}

async function processUploadedFiles(
    files: any[],
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
            const clientStats = JSON.parse(clientFilterStats);
            droppedSummary.push(`📊 Processing Summary: ${clientStats.filteredCount} files excluded from ${clientStats.totalFiles} total files`);
            
            if (clientStats.droppedFolders && clientStats.droppedFolders.length > 0) {
                droppedSummary.push(`📁 Client-excluded folders: ${clientStats.droppedFolders.join(', ')}`);
            }
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

export const api = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
    const path = req.path;
    
    console.log(`API request: ${req.method} ${path}`);
    
    try {
        if (path === '/api/upload') {
            if (req.method !== 'POST') {
                res.status(405).json({ error: 'Method not allowed' });
                return;
            }
            
            const { fields, files } = await processMultipartData(req);
            const projectName = fields.projectName || 'Unnamed Project';
            const clientFilterStats = fields.clientFilterStats;
            
            console.log(`Upload request: ${files.length} files for project "${projectName}"`);
            
            const result = await processUploadedFiles(files, projectName, clientFilterStats);
            res.json(result);
            
        } else if (path === '/api/claude') {
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