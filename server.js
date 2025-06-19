"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const fs_1 = require("fs");
const url_1 = require("url");
const sdk_1 = require("@anthropic-ai/sdk");
const multer_1 = __importDefault(require("multer"));
const path_1 = require("path");
class HackathonServer {
    constructor() {
        this.port = 3001;
        // File filtering constants
        this.IGNORED_DIRECTORIES = [
            'node_modules', '.git', '.next', 'dist', 'build', 'target', 'bin', 'obj',
            '__pycache__', '.venv', 'venv', 'env', '.env', 'coverage', '.nyc_output',
            'vendor', 'bower_components', '.gradle', '.mvn', 'out', 'lib', 'libs',
            'packages', 'deps', 'dependencies', 'tmp', 'temp', 'cache', '.cache'
        ];
        this.IGNORED_EXTENSIONS = [
            '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib',
            '.class', '.jar', '.war', '.ear', '.deb', '.rpm', '.dmg', '.iso',
            '.mp4', '.avi', '.mov', '.wmv', '.mp3', '.wav', '.flac', '.aac',
            '.min.js', '.min.css', '.bundle.js', '.chunk.js', '.woff', '.woff2',
            '.ttf', '.eot', '.map', '.lock',
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.svg', '.webp',
            '.ico', '.cur', '.psd', '.ai', '.sketch', '.fig'
        ];
        this.MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
        this.MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total per project
        this.CLAUDE_TEXT_LIMIT = 8 * 1024 * 1024; // 8MB for Claude API (conservative limit)
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error('❌ ANTHROPIC_API_KEY environment variable is required');
            process.exit(1);
        }
        this.anthropic = new sdk_1.Anthropic({
            apiKey: apiKey
        });
        // Configure multer for file uploads - set very high limits to avoid errors
        this.upload = (0, multer_1.default)({
            storage: multer_1.default.memoryStorage(),
            limits: {
                fileSize: 100 * 1024 * 1024, // 100MB - we'll filter in processing
                files: 2000 // Max 2000 files
            },
            fileFilter: (req, file, cb) => {
                if (this.shouldIgnoreFile(file.originalname)) {
                    console.log(`🚫 Ignoring file: ${file.originalname}`);
                    cb(null, false);
                }
                else {
                    cb(null, true);
                }
            }
        });
        console.log('🚀 Hackathon server initialized');
    }
    shouldIgnoreFile(filepath) {
        const filename = filepath.toLowerCase();
        const pathParts = filepath.split('/');
        // Check if any directory in the path should be ignored
        for (const part of pathParts) {
            if (this.IGNORED_DIRECTORIES.includes(part.toLowerCase())) {
                return true;
            }
        }
        // Check file extension
        const ext = (0, path_1.extname)(filename);
        if (this.IGNORED_EXTENSIONS.includes(ext)) {
            return true;
        }
        // Ignore hidden files (starting with .)
        const basename = pathParts[pathParts.length - 1];
        if (basename.startsWith('.') && basename !== '.env.example' && basename !== '.gitignore') {
            return true;
        }
        return false;
    }
    handleCORS(res) {
        return __awaiter(this, void 0, void 0, function* () {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        });
    }
    readBody(req) {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    processUploadedFiles(files, projectName) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            console.log(`📁 Processing ${files.length} files for project: ${projectName}`);
            const processedFiles = [];
            let totalSize = 0;
            let skippedFiles = 0;
            for (const file of files) {
                try {
                    // Skip individual files that are too large
                    if (file.buffer.length > this.MAX_FILE_SIZE) {
                        console.log(`⚠️  Skipping ${file.originalname} - file size ${(file.buffer.length / 1024 / 1024).toFixed(2)}MB exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
                        skippedFiles++;
                        continue;
                    }
                    // Skip if adding this file would exceed total size limit
                    if (totalSize + file.buffer.length > this.MAX_TOTAL_SIZE) {
                        console.log(`⚠️  Skipping ${file.originalname} - would exceed total size limit of ${this.MAX_TOTAL_SIZE / 1024 / 1024}MB`);
                        skippedFiles++;
                        continue;
                    }
                    let content;
                    const isTextFile = this.isTextFile(file.originalname, file.mimetype);
                    if (isTextFile) {
                        content = file.buffer.toString('utf-8');
                    }
                    else {
                        // For binary files, store as base64
                        content = file.buffer.toString('base64');
                    }
                    processedFiles.push({
                        name: file.originalname,
                        content,
                        type: file.mimetype || this.getFileType(file.originalname),
                        size: file.buffer.length,
                        path: file.originalname
                    });
                    totalSize += file.buffer.length;
                }
                catch (error) {
                    console.error(`❌ Error processing file ${file.originalname}:`, error);
                    skippedFiles++;
                }
            }
            const processingTime = Date.now() - startTime;
            console.log(`✅ Processed ${processedFiles.length} files in ${processingTime}ms`);
            console.log(`📊 Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
            if (skippedFiles > 0) {
                console.log(`⚠️  Skipped ${skippedFiles} files`);
            }
            const warnings = [];
            if (skippedFiles > 0) {
                warnings.push(`${skippedFiles} files were skipped due to size limits`);
            }
            return {
                success: true,
                projectName,
                files: processedFiles,
                skippedFiles,
                totalSize,
                warnings
            };
        });
    }
    isTextFile(filename, mimetype) {
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
        const ext = (0, path_1.extname)(filename.toLowerCase());
        const textExtensions = [
            '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
            '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj',
            '.html', '.css', '.scss', '.sass', '.less', '.xml', '.json', '.yaml', '.yml',
            '.md', '.txt', '.log', '.cfg', '.conf', '.ini', '.env', '.sh', '.bat',
            '.sql', '.r', '.m', '.pl', '.lua', '.vim', '.dockerfile', '.makefile'
        ];
        return textExtensions.includes(ext) || filename.toLowerCase().includes('makefile') || filename.toLowerCase().includes('dockerfile');
    }
    getFileType(filename) {
        const ext = (0, path_1.extname)(filename.toLowerCase());
        const typeMap = {
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
    callClaude(prompt, seed) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            console.log(`🤖 Calling Claude API (seed: ${seed})`);
            try {
                const response = yield this.anthropic.messages.create({
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
            }
            catch (error) {
                const processingTime = Date.now() - startTime;
                console.error(`❌ Claude API error after ${processingTime}ms:`, error);
                throw error;
            }
        });
    }
    handleUpload(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const startTime = Date.now();
            console.log(`📤 Upload request received`);
            try {
                if (req.method === 'OPTIONS') {
                    yield this.handleCORS(res);
                    res.writeHead(200);
                    res.end();
                    return;
                }
                if (req.method !== 'POST') {
                    res.writeHead(405, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }
                yield this.handleCORS(res);
                // Use multer to handle the multipart form data
                const uploadHandler = this.upload.fields([{ name: 'files' }, { name: 'projectName' }]);
                let multerSkippedFiles = 0;
                yield new Promise((resolve, reject) => {
                    uploadHandler(req, res, (err) => {
                        if (err) {
                            // Handle multer errors gracefully - don't reject, just log and continue
                            if (err.code === 'LIMIT_FILE_SIZE') {
                                console.log(`⚠️  Multer skipped large file - exceeds ${100}MB limit`);
                                multerSkippedFiles++;
                                resolve(); // Continue processing with files that were uploaded
                            }
                            else if (err.code === 'LIMIT_FILE_COUNT') {
                                console.log(`⚠️  Too many files, processing first 2000 files only`);
                                resolve(); // Continue with processed files
                            }
                            else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                                console.log(`⚠️  Unexpected file field, ignoring`);
                                resolve(); // Continue processing
                            }
                            else {
                                console.error('❌ Unhandled multer error:', err);
                                resolve(); // Even for unexpected errors, try to continue
                            }
                        }
                        else {
                            resolve();
                        }
                    });
                });
                const files = ((_a = req.files) === null || _a === void 0 ? void 0 : _a.files) || [];
                const projectName = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.projectName) || 'Unnamed Project';
                if (!files || files.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: 'No files uploaded'
                    }));
                    return;
                }
                const result = yield this.processUploadedFiles(files, projectName);
                // Add multer skipped files to the total
                if (multerSkippedFiles > 0) {
                    result.skippedFiles = (result.skippedFiles || 0) + multerSkippedFiles;
                    if (!result.warnings)
                        result.warnings = [];
                    result.warnings.push(`${multerSkippedFiles} extremely large files were skipped during upload`);
                }
                const totalTime = Date.now() - startTime;
                console.log(`🎉 Upload completed in ${totalTime}ms`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            }
            catch (error) {
                const totalTime = Date.now() - startTime;
                console.error(`❌ Upload error after ${totalTime}ms:`, error);
                // Even if upload fails, try to return whatever we can
                try {
                    const files = ((_c = req.files) === null || _c === void 0 ? void 0 : _c.files) || [];
                    const projectName = ((_d = req.body) === null || _d === void 0 ? void 0 : _d.projectName) || 'Failed Upload';
                    if (files.length > 0) {
                        console.log(`🔄 Attempting partial recovery with ${files.length} files`);
                        const result = yield this.processUploadedFiles(files, projectName);
                        result.warnings = result.warnings || [];
                        result.warnings.push('Upload encountered errors but partial processing completed');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(result));
                    }
                    else {
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
                }
                catch (recoveryError) {
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
        });
    }
    handleClaudeRequest(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            console.log(`🤖 Claude API request received`);
            try {
                if (req.method === 'OPTIONS') {
                    yield this.handleCORS(res);
                    res.writeHead(200);
                    res.end();
                    return;
                }
                if (req.method !== 'POST') {
                    res.writeHead(405, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }
                yield this.handleCORS(res);
                const body = yield this.readBody(req);
                const requestData = JSON.parse(body);
                if (!requestData.prompt) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Prompt is required' }));
                    return;
                }
                const response = yield this.callClaude(requestData.prompt, requestData.seed || 12345);
                const totalTime = Date.now() - startTime;
                console.log(`✅ Claude request completed in ${totalTime}ms`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    response: response.content,
                    usage: response.usage
                }));
            }
            catch (error) {
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
        });
    }
    handleStaticFiles(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const parsedUrl = (0, url_1.parse)(req.url || '');
            let pathname = parsedUrl.pathname || '/';
            // Default to index.html for root path
            if (pathname === '/') {
                pathname = '/index.html';
            }
            const filePath = `.${pathname}`;
            try {
                const content = yield fs_1.promises.readFile(filePath);
                let contentType = 'text/html';
                if (pathname.endsWith('.js')) {
                    contentType = 'application/javascript';
                }
                else if (pathname.endsWith('.css')) {
                    contentType = 'text/css';
                }
                else if (pathname.endsWith('.json')) {
                    contentType = 'application/json';
                }
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
            catch (error) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found');
            }
        });
    }
    start() {
        const server = (0, http_1.createServer)((req, res) => __awaiter(this, void 0, void 0, function* () {
            const parsedUrl = (0, url_1.parse)(req.url || '');
            const pathname = parsedUrl.pathname;
            try {
                if (pathname === '/api/upload') {
                    yield this.handleUpload(req, res);
                }
                else if (pathname === '/api/claude') {
                    yield this.handleClaudeRequest(req, res);
                }
                else {
                    yield this.handleStaticFiles(req, res);
                }
            }
            catch (error) {
                console.error(`❌ Unhandled server error for ${pathname}:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'Internal server error',
                    message: error instanceof Error ? error.message : 'Unknown error'
                }));
            }
        }));
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
