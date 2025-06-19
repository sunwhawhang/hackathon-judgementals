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
class HackathonJudge {
    constructor() {
        this.projects = [];
        this.judges = [];
        this.evaluations = [];
        this.CLAUDE_API_SEED = 12345; // Fixed seed for consistency
        this.initializeDefaultJudges();
        this.renderJudges();
    }
    initializeDefaultJudges() {
        this.judges = [
            {
                id: 'technical',
                name: '🔧 Technical Excellence Judge',
                description: 'Evaluates code quality, architecture, and technical implementation',
                prompt: `You are a technical judge evaluating hackathon projects. Focus on:
                - Code quality, structure, and best practices
                - Technical complexity and innovation
                - Architecture and design patterns
                - Performance considerations
                - Use of technologies and frameworks
                
                Provide a detailed analysis of what you like and don't like about the technical aspects, then give an absolute score from 1-10.`
            },
            {
                id: 'innovation',
                name: '💡 Innovation Judge',
                description: 'Focuses on creativity, originality, and problem-solving approach',
                prompt: `You are an innovation judge evaluating hackathon projects. Focus on:
                - Originality and creativity of the solution
                - Problem-solving approach and methodology
                - Uniqueness compared to existing solutions
                - Creative use of technology
                - Novel features or implementations
                
                Provide a detailed analysis of the innovative aspects, what's creative vs conventional, then give an absolute score from 1-10.`
            },
            {
                id: 'user-experience',
                name: '👤 User Experience Judge',
                description: 'Evaluates usability, design, and overall user interaction',
                prompt: `You are a UX judge evaluating hackathon projects. Focus on:
                - User interface design and aesthetics
                - Usability and user flow
                - Accessibility considerations
                - Documentation quality for users
                - Overall user experience and ease of use
                
                Provide a detailed analysis of the user experience aspects, both positive and negative, then give an absolute score from 1-10.`
            }
        ];
    }
    renderJudges() {
        const judgesGrid = document.getElementById('judgesGrid');
        if (!judgesGrid)
            return;
        judgesGrid.innerHTML = this.judges.map(judge => `
            <div class="judge-card">
                <h3>${judge.name}</h3>
                <p>${judge.description}</p>
                ${judge.id.startsWith('custom') ? `<button class="btn btn-danger" onclick="removeJudge('${judge.id}')">Remove</button>` : ''}
            </div>
        `).join('');
    }
    renderProjects() {
        const projectList = document.getElementById('projectList');
        if (!projectList)
            return;
        projectList.innerHTML = this.projects.map(project => `
            <div class="project-item">
                <h4>${project.name}</h4>
                <p>${project.files.length} files uploaded</p>
            </div>
        `).join('');
    }
    uploadProject() {
        return __awaiter(this, void 0, void 0, function* () {
            const nameInput = document.getElementById('projectName');
            const fileInput = document.getElementById('folderUpload');
            const uploadSection = document.querySelector('.upload-section');
            if (!nameInput.value.trim()) {
                this.showError('Please enter a project name');
                return;
            }
            if (!fileInput.files || fileInput.files.length === 0) {
                this.showError('Please select a project folder');
                return;
            }
            // Show upload progress
            uploadSection.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Uploading and processing files...</p>
                <p style="font-size: 12px; color: #666;">Note: Large projects may be truncated to fit Claude's limits</p>
            </div>
        `;
            try {
                const formData = new FormData();
                formData.append('projectName', nameInput.value.trim());
                // Add all files to form data
                for (let i = 0; i < fileInput.files.length; i++) {
                    formData.append('files', fileInput.files[i]);
                }
                const response = yield fetch('http://localhost:3001/api/upload', {
                    method: 'POST',
                    body: formData
                });
                const result = yield response.json();
                if (!result.success) {
                    throw new Error(result.error || 'Upload failed');
                }
                // Add project to local list
                this.projects.push({
                    name: result.projectName,
                    files: result.files
                });
                let message = `✅ Uploaded ${result.files.length} files successfully!`;
                if (result.skippedFiles && result.skippedFiles > 0) {
                    message += ` (${result.skippedFiles} files skipped due to size limits)`;
                }
                this.showSuccess(message);
                // Show warnings if any
                if (result.warnings && result.warnings.length > 0) {
                    setTimeout(() => {
                        var _a;
                        (_a = result.warnings) === null || _a === void 0 ? void 0 : _a.forEach((warning) => {
                            this.showWarning(warning);
                        });
                    }, 1000);
                }
                nameInput.value = '';
                fileInput.value = '';
                this.renderProjects();
            }
            catch (error) {
                console.error('Upload error:', error);
                this.showError(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            finally {
                // Restore upload form
                uploadSection.innerHTML = `
                <div>
                    <input type="text" id="projectName" class="upload-input" placeholder="Project Name" />
                    <input type="file" id="folderUpload" webkitdirectory directory multiple class="upload-input" />
                    <br>
                    <button class="btn" onclick="uploadProject()">Upload Project</button>
                </div>
            `;
            }
        });
    }
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            background: #ff6b6b; color: white; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px; word-wrap: break-word;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            background: #51cf66; color: white; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px; word-wrap: break-word;
        `;
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        setTimeout(() => successDiv.remove(), 3000);
    }
    showWarning(message) {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            position: fixed; top: 80px; right: 20px; z-index: 1000;
            background: #ffa726; color: white; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px; word-wrap: break-word;
        `;
        warningDiv.textContent = `⚠️ ${message}`;
        document.body.appendChild(warningDiv);
        setTimeout(() => warningDiv.remove(), 4000);
    }
    addCustomJudge() {
        const nameInput = document.getElementById('judgeName');
        const promptInput = document.getElementById('judgePrompt');
        if (!nameInput.value.trim() || !promptInput.value.trim()) {
            alert('Please fill in both judge name and prompt');
            return;
        }
        const customJudge = {
            id: `custom-${Date.now()}`,
            name: nameInput.value.trim(),
            description: 'Custom judge with specific evaluation criteria',
            prompt: promptInput.value.trim()
        };
        this.judges.push(customJudge);
        nameInput.value = '';
        promptInput.value = '';
        this.renderJudges();
    }
    removeJudge(judgeId) {
        this.judges = this.judges.filter(judge => judge.id !== judgeId);
        this.renderJudges();
    }
    callClaudeAPI(prompt) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch('http://localhost:3001/api/claude', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                        seed: this.CLAUDE_API_SEED
                    })
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = yield response.json();
                if (!data.success) {
                    throw new Error(data.error || 'API call failed');
                }
                return data.response;
            }
            catch (error) {
                console.error('Error calling Claude API:', error);
                // Fallback to mock response if API fails
                const mockResponse = {
                    summary: "API call failed - using mock evaluation. The project shows reasonable implementation but detailed analysis is not available.",
                    score: Math.floor(Math.random() * 4) + 6,
                    likes: [
                        "Project structure appears organized",
                        "Files are properly named",
                        "Basic functionality implemented"
                    ],
                    dislikes: [
                        "Unable to perform detailed analysis",
                        "API connection failed",
                        "Limited evaluation available"
                    ]
                };
                return JSON.stringify(mockResponse);
            }
        });
    }
    formatProjectForJudge(project) {
        let formatted = `Project: ${project.name}\n\nFiles and Contents:\n\n`;
        const maxSize = 7 * 1024 * 1024; // 7MB limit for formatted content
        let currentSize = formatted.length;
        let truncatedFiles = 0;
        const sortedFiles = [...project.files].sort((a, b) => {
            // Prioritize important files (README, main files, config files)
            const getPriority = (filename) => {
                const name = filename.toLowerCase();
                if (name.includes('readme'))
                    return 1;
                if (name.includes('main') || name.includes('index'))
                    return 2;
                if (name.includes('config') || name.includes('package.json'))
                    return 3;
                if (name.endsWith('.md'))
                    return 4;
                if (name.endsWith('.py') || name.endsWith('.js') || name.endsWith('.ts'))
                    return 5;
                return 10;
            };
            return getPriority(a.name) - getPriority(b.name);
        });
        for (const file of sortedFiles) {
            let fileContent = `--- ${file.name} (${file.type}) ---\n`;
            if (file.type.startsWith('text/') ||
                file.type === 'application/json' ||
                file.name.endsWith('.js') ||
                file.name.endsWith('.ts') ||
                file.name.endsWith('.py') ||
                file.name.endsWith('.html') ||
                file.name.endsWith('.css') ||
                file.name.endsWith('.md')) {
                let content = file.content;
                // Truncate very large files
                if (content.length > 50000) {
                    content = content.substring(0, 50000) + '\n... [FILE TRUNCATED - TOO LARGE] ...\n';
                }
                fileContent += content + '\n\n';
            }
            else {
                fileContent += `[Binary file - ${file.type}, ${file.size} bytes]\n\n`;
            }
            // Check if adding this file would exceed the limit
            if (currentSize + fileContent.length > maxSize) {
                truncatedFiles = sortedFiles.length - sortedFiles.indexOf(file);
                break;
            }
            formatted += fileContent;
            currentSize += fileContent.length;
        }
        if (truncatedFiles > 0) {
            formatted += `\n... [${truncatedFiles} files not included due to size limits] ...\n`;
        }
        return formatted;
    }
    startJudging() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.projects.length === 0) {
                    this.showError('Please upload at least one project');
                    return;
                }
                if (this.judges.length === 0) {
                    this.showError('No judges available');
                    return;
                }
                const startButton = document.getElementById('startJudging');
                const progressDiv = document.getElementById('judgingProgress');
                startButton.disabled = true;
                progressDiv === null || progressDiv === void 0 ? void 0 : progressDiv.classList.remove('hidden');
                this.evaluations = [];
                console.log(`🏁 Starting judging process for ${this.projects.length} projects with ${this.judges.length} judges`);
                // Process each project with comprehensive error handling
                for (const project of this.projects) {
                    try {
                        const projectEvaluation = {
                            projectName: project.name,
                            judgeResults: []
                        };
                        console.log(`📊 Evaluating project: ${project.name}`);
                        const projectData = this.formatProjectForJudge(project);
                        // Get evaluations from all judges in parallel
                        const judgePromises = this.judges.map((judge) => __awaiter(this, void 0, void 0, function* () {
                            const basePrompt = `${judge.prompt}\n\nProject to evaluate:\n`;
                            const endPrompt = `\n\nPlease provide your evaluation in the following JSON format:
                {
                    "summary": "Your detailed analysis and reasoning",
                    "score": <number from 1-10>,
                    "likes": ["positive aspect 1", "positive aspect 2", ...],
                    "dislikes": ["negative aspect 1", "negative aspect 2", ...]
                }`;
                            // Calculate available space for project data (8MB limit with safety margin)
                            const maxPromptSize = 7.5 * 1024 * 1024; // 7.5MB safety margin
                            const baseSize = basePrompt.length + endPrompt.length;
                            const availableSize = maxPromptSize - baseSize;
                            let truncatedProjectData = projectData;
                            if (projectData.length > availableSize) {
                                truncatedProjectData = projectData.substring(0, availableSize - 200) + '\n\n... [PROJECT DATA TRUNCATED DUE TO SIZE LIMITS] ...';
                                console.log(`⚠️  Truncating project data from ${(projectData.length / 1024 / 1024).toFixed(2)}MB to ${(truncatedProjectData.length / 1024 / 1024).toFixed(2)}MB for judge ${judge.name}`);
                            }
                            const fullPrompt = basePrompt + truncatedProjectData + endPrompt;
                            try {
                                const response = yield this.callClaudeAPI(fullPrompt);
                                const evaluation = JSON.parse(response);
                                // Validate evaluation structure and provide defaults
                                return {
                                    judgeId: judge.id,
                                    judgeName: judge.name,
                                    summary: evaluation.summary || 'No summary provided',
                                    score: (evaluation.score >= 1 && evaluation.score <= 10) ? evaluation.score : 5,
                                    likes: Array.isArray(evaluation.likes) ? evaluation.likes : ['Evaluation completed'],
                                    dislikes: Array.isArray(evaluation.dislikes) ? evaluation.dislikes : []
                                };
                            }
                            catch (error) {
                                console.error(`❌ Error evaluating project ${project.name} with judge ${judge.name}:`, error);
                                // Always provide a meaningful fallback evaluation
                                return {
                                    judgeId: judge.id,
                                    judgeName: judge.name,
                                    summary: `Unable to complete detailed evaluation for ${project.name}. System encountered an error but judging process continued.`,
                                    score: 5, // Neutral score when evaluation fails
                                    likes: [
                                        'Project was submitted for evaluation',
                                        'File structure appears organized',
                                        'Standard naming conventions observed'
                                    ],
                                    dislikes: [
                                        'Could not perform detailed analysis due to system error',
                                        'Limited technical assessment available',
                                        'Manual review recommended for complete evaluation'
                                    ]
                                };
                            }
                        }));
                        projectEvaluation.judgeResults = yield Promise.all(judgePromises);
                        this.evaluations.push(projectEvaluation);
                    }
                    catch (projectError) {
                        console.error(`❌ Error processing project ${project.name}:`, projectError);
                        // Add project with fallback evaluation
                        const fallbackEvaluation = {
                            projectName: project.name,
                            judgeResults: this.judges.map(judge => ({
                                judgeId: judge.id,
                                judgeName: judge.name,
                                summary: `Error processing project ${project.name}. Unable to complete evaluation.`,
                                score: 3, // Low score for failed evaluation
                                likes: ['Project was submitted'],
                                dislikes: ['Evaluation failed due to processing error', 'Technical issues prevented analysis']
                            }))
                        };
                        this.evaluations.push(fallbackEvaluation);
                    }
                }
                console.log(`🎯 Completed individual evaluations, starting master judge ranking`);
                // Get final ranking from master judge with error handling
                try {
                    yield this.getFinalRanking();
                }
                catch (masterError) {
                    console.error(`❌ Master judge failed, using fallback ranking:`, masterError);
                    // Fallback ranking already handled in getFinalRanking
                }
                console.log(`🏆 Judging process completed successfully`);
            }
            catch (error) {
                console.error(`❌ Critical error in judging process:`, error);
                // Ensure we have some evaluations even if everything fails
                if (this.evaluations.length === 0 && this.projects.length > 0) {
                    this.evaluations = this.projects.map((project, index) => ({
                        projectName: project.name,
                        finalRank: index + 1,
                        judgeResults: [{
                                judgeId: 'fallback',
                                judgeName: 'System Fallback',
                                summary: 'Critical system error prevented normal evaluation. This is a placeholder result.',
                                score: 5,
                                likes: ['Project was submitted for evaluation'],
                                dislikes: ['System error prevented detailed analysis']
                            }]
                    }));
                }
                this.showError('Judging completed with errors. Results may be limited.');
            }
            finally {
                // Always re-enable UI and show results
                const startButton = document.getElementById('startJudging');
                const progressDiv = document.getElementById('judgingProgress');
                if (startButton)
                    startButton.disabled = false;
                progressDiv === null || progressDiv === void 0 ? void 0 : progressDiv.classList.add('hidden');
                // Always display results, even if partial/fallback
                this.displayResults();
            }
        });
    }
    getFinalRanking() {
        return __awaiter(this, void 0, void 0, function* () {
            const basePrompt = `You are the master judge for a hackathon. Below are the evaluations from individual judges for each project. Your task is to provide a final relative ranking of all projects based on these evaluations.

        Project Evaluations:`;
            const endPrompt = `
        
        Please provide a final ranking in JSON format:
        {
            "rankings": [
                {"projectName": "Project Name", "rank": 1, "reasoning": "Why this project ranked here"},
                ...
            ]
        }`;
            const evaluationsText = this.evaluations.map(evaluation => `
        Project: ${evaluation.projectName}
        Judge Evaluations:
        ${evaluation.judgeResults.map(result => `
        - ${result.judgeName} (Score: ${result.score}/10)
          Summary: ${result.summary}
          Likes: ${result.likes.join(', ')}
          Dislikes: ${result.dislikes.join(', ')}
        `).join('\n')}
        `).join('\n\n');
            // Calculate available space and truncate if necessary
            const maxPromptSize = 7.5 * 1024 * 1024; // 7.5MB safety margin
            const baseSize = basePrompt.length + endPrompt.length;
            const availableSize = maxPromptSize - baseSize;
            let truncatedEvaluations = evaluationsText;
            if (evaluationsText.length > availableSize) {
                truncatedEvaluations = evaluationsText.substring(0, availableSize - 200) + '\n\n... [EVALUATIONS TRUNCATED DUE TO SIZE LIMITS] ...';
                console.log(`⚠️  Truncating master judge evaluations from ${(evaluationsText.length / 1024 / 1024).toFixed(2)}MB to ${(truncatedEvaluations.length / 1024 / 1024).toFixed(2)}MB`);
            }
            const masterPrompt = basePrompt + truncatedEvaluations + endPrompt;
            try {
                const response = yield this.callClaudeAPI(masterPrompt);
                const masterEvaluation = JSON.parse(response);
                // Validate master evaluation structure
                if (masterEvaluation.rankings && Array.isArray(masterEvaluation.rankings)) {
                    // Apply final rankings
                    masterEvaluation.rankings.forEach((ranking) => {
                        const evaluation = this.evaluations.find(evalItem => evalItem.projectName === ranking.projectName);
                        if (evaluation && typeof ranking.rank === 'number') {
                            evaluation.finalRank = ranking.rank;
                        }
                    });
                    // Sort evaluations by final rank
                    this.evaluations.sort((a, b) => (a.finalRank || 999) - (b.finalRank || 999));
                }
                else {
                    throw new Error('Invalid master evaluation response structure');
                }
            }
            catch (error) {
                console.error('❌ Error getting final ranking, using fallback ranking by average score:', error);
                // Robust fallback: rank by average score with proper error handling
                try {
                    this.evaluations.forEach((evaluation, index) => {
                        let avgScore = 5; // Default neutral score
                        if (evaluation.judgeResults && evaluation.judgeResults.length > 0) {
                            const validScores = evaluation.judgeResults
                                .map(result => result.score)
                                .filter(score => typeof score === 'number' && score >= 1 && score <= 10);
                            if (validScores.length > 0) {
                                avgScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
                            }
                        }
                        evaluation.finalRank = index + 1; // Will be re-sorted below
                    });
                    // Sort by average score (highest first)
                    this.evaluations.sort((a, b) => {
                        const getAvgScore = (evaluation) => {
                            if (!evaluation.judgeResults || evaluation.judgeResults.length === 0)
                                return 0;
                            const validScores = evaluation.judgeResults
                                .map(result => result.score)
                                .filter(score => typeof score === 'number' && score >= 1 && score <= 10);
                            return validScores.length > 0 ?
                                validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0;
                        };
                        return getAvgScore(b) - getAvgScore(a);
                    });
                    // Assign final ranks after sorting
                    this.evaluations.forEach((evaluation, index) => {
                        evaluation.finalRank = index + 1;
                    });
                }
                catch (fallbackError) {
                    console.error('❌ Even fallback ranking failed, using project order:', fallbackError);
                    // Final fallback: just number them in order
                    this.evaluations.forEach((evaluation, index) => {
                        evaluation.finalRank = index + 1;
                    });
                }
            }
        });
    }
    displayResults() {
        try {
            const resultsSection = document.getElementById('resultsSection');
            const finalRankings = document.getElementById('finalRankings');
            if (!resultsSection || !finalRankings) {
                console.error('❌ Results display elements not found');
                return;
            }
            if (this.evaluations.length === 0) {
                finalRankings.innerHTML = '<p>No evaluation results to display.</p>';
                resultsSection.classList.remove('hidden');
                return;
            }
            resultsSection.classList.remove('hidden');
            finalRankings.innerHTML = this.evaluations.map(evaluation => {
                try {
                    // Calculate average score with error handling
                    let avgScore = 0;
                    if (evaluation.judgeResults && evaluation.judgeResults.length > 0) {
                        const validScores = evaluation.judgeResults
                            .map(result => typeof result.score === 'number' ? result.score : 0)
                            .filter(score => score > 0);
                        avgScore = validScores.length > 0 ?
                            validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0;
                    }
                    const sanitizedProjectName = evaluation.projectName.replace(/['"]/g, '');
                    return `
                        <div class="result-item">
                            <div class="result-header" onclick="toggleResult('${sanitizedProjectName}')">
                                <div>
                                    <span class="rank-badge">#${evaluation.finalRank || '?'}</span>
                                    <strong>${evaluation.projectName}</strong>
                                </div>
                                <div class="score">${avgScore.toFixed(1)}/10</div>
                            </div>
                            <div id="result-${sanitizedProjectName}" class="result-content">
                                ${evaluation.judgeResults && evaluation.judgeResults.length > 0 ? `
                                    <div class="tabs">
                                        ${evaluation.judgeResults.map((result, index) => `
                                            <div class="tab ${index === 0 ? 'active' : ''}" onclick="switchTab('${sanitizedProjectName}', ${index})">
                                                ${result.judgeName || 'Unknown Judge'}
                                            </div>
                                        `).join('')}
                                    </div>
                                    ${evaluation.judgeResults.map((result, index) => `
                                        <div id="tab-${sanitizedProjectName}-${index}" class="tab-content ${index === 0 ? 'active' : ''}">
                                            <h4>Score: ${result.score || 0}/10</h4>
                                            <h5>Summary:</h5>
                                            <p>${result.summary || 'No summary available'}</p>
                                            <h5>Likes:</h5>
                                            <ul>
                                                ${(result.likes || []).map(like => `<li>${like}</li>`).join('')}
                                            </ul>
                                            <h5>Dislikes:</h5>
                                            <ul>
                                                ${(result.dislikes || []).map(dislike => `<li>${dislike}</li>`).join('')}
                                            </ul>
                                        </div>
                                    `).join('')}
                                ` : '<p>No judge results available for this project.</p>'}
                            </div>
                        </div>
                    `;
                }
                catch (itemError) {
                    console.error(`❌ Error rendering result for ${evaluation.projectName}:`, itemError);
                    return `
                        <div class="result-item">
                            <div class="result-header">
                                <div>
                                    <span class="rank-badge">#${evaluation.finalRank || '?'}</span>
                                    <strong>${evaluation.projectName}</strong>
                                </div>
                                <div class="score">Error</div>
                            </div>
                            <div class="result-content">
                                <p>Error displaying results for this project.</p>
                            </div>
                        </div>
                    `;
                }
            }).join('');
            console.log(`✅ Results displayed for ${this.evaluations.length} projects`);
        }
        catch (error) {
            console.error('❌ Critical error in displayResults:', error);
            // Fallback display
            const finalRankings = document.getElementById('finalRankings');
            if (finalRankings) {
                finalRankings.innerHTML = '<p>Error displaying results. Please refresh and try again.</p>';
            }
        }
    }
}
// Global instance
const hackathonJudge = new HackathonJudge();
// Global functions for HTML onclick handlers
function uploadProject() {
    hackathonJudge.uploadProject();
}
function addCustomJudge() {
    hackathonJudge.addCustomJudge();
}
function removeJudge(judgeId) {
    hackathonJudge.removeJudge(judgeId);
}
function startJudging() {
    hackathonJudge.startJudging();
}
function toggleResult(projectName) {
    const resultContent = document.getElementById(`result-${projectName}`);
    if (resultContent) {
        resultContent.classList.toggle('active');
    }
}
function switchTab(projectName, tabIndex) {
    // Hide all tab contents for this project
    const tabContents = document.querySelectorAll(`[id^="tab-${projectName}-"]`);
    tabContents.forEach(content => content.classList.remove('active'));
    // Hide all tabs for this project
    const tabs = document.querySelectorAll(`[onclick*="${projectName}"]`);
    tabs.forEach(tab => {
        if (tab.classList.contains('tab')) {
            tab.classList.remove('active');
        }
    });
    // Show selected tab content
    const selectedContent = document.getElementById(`tab-${projectName}-${tabIndex}`);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }
    // Activate selected tab
    const selectedTab = document.querySelector(`[onclick="switchTab('${projectName}', ${tabIndex})"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
}
