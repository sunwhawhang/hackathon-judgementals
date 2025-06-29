
interface ProjectFile {
    name: string;
    content?: string;  // Optional for Firebase Storage
    type: string;
    size: number;
    path: string;
    storageUrl?: string;  // Firebase Storage URL
    storagePath?: string; // Firebase Storage path
}

interface Project {
    name: string;
    files: ProjectFile[];
    droppedSummary?: string[];
}

interface Judge {
    id: string;
    name: string;
    description: string;
    prompt: string;
}

interface JudgeResult {
    judgeId: string;
    judgeName: string;
    summary: string;
    score: number;
    likes: string[];
    dislikes: string[];
}

interface ProjectEvaluation {
    projectName: string;
    judgeResults: JudgeResult[];
    finalRank?: number;
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

interface ClaudeAPIResponse {
    success: boolean;
    response: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
    error?: string;
    warning?: string;
}

class HackathonJudge {
    private projects: Project[] = [];
    private judges: Judge[] = [];
    private evaluations: ProjectEvaluation[] = [];
    private readonly CLAUDE_API_SEED = 12345; // Fixed seed for consistency
    private readonly API_BASE_URL: string;

    constructor() {
        // Determine API base URL based on environment
        this.API_BASE_URL = this.getApiBaseUrl();
        console.log(`🌐 Using API base URL: ${this.API_BASE_URL}`);

        this.initializeDefaultJudges();
        this.renderJudges();
        this.initializeFileInputListeners();
    }

    private getApiBaseUrl(): string {
        // Check for explicit configuration first
        if ((window as any).HACKJUDGE_API_URL) {
            return (window as any).HACKJUDGE_API_URL;
        }

        // Auto-detect based on environment
        const isDev = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.endsWith('.localhost');

        if (isDev) {
            // Development mode - use Firebase Functions emulator
            const projectId = (window as any).HACKJUDGE_PROJECT_ID || 'hackathon-judgementals';
            const functionsPort = (window as any).HACKJUDGE_FUNCTIONS_PORT || '5001';
            return `http://${window.location.hostname}:${functionsPort}/${projectId}/us-central1`;
        } else {
            // Production mode - use relative paths for deployed Firebase Functions
            return '';
        }
    }

    private initializeDefaultJudges(): void {
        this.judges = [
            {
                id: 'technical',
                name: '🔧 Technical Excellence Judge',
                description: `Software engineering expert with comprehensive expertise across multiple technical domains and enterprise-scale system development:

• **System Architecture & Design Patterns**: Microservices architecture design and orchestration, Monolithic system optimization and modular decomposition, Event-driven architecture and message queuing systems, Layered architecture patterns and clean architecture principles, Hexagonal architecture and dependency inversion, Domain-driven design (DDD) and bounded context modeling, Command Query Responsibility Segregation (CQRS), Event sourcing and eventual consistency patterns, Service mesh implementation and inter-service communication, API gateway patterns and request routing strategies

• **Performance Engineering & Optimization**: Application profiling and performance monitoring, Memory optimization and garbage collection tuning, CPU utilization analysis and multi-threading optimization, Database query optimization and indexing strategies, Caching strategies (Redis, Memcached, CDN, application-level), Load balancing algorithms and horizontal scaling techniques, Vertical scaling and resource allocation optimization, Performance testing methodologies and stress testing, Application Performance Monitoring (APM) tools integration, Bottleneck identification and elimination strategies

• **Database Systems & Data Architecture**: Relational database design and normalization principles, NoSQL database selection and implementation (MongoDB, Cassandra, DynamoDB), Database indexing strategies and query optimization techniques, ACID properties implementation and transaction management, Eventual consistency models and distributed database patterns, Data modeling and schema design best practices, Database migration strategies and version control, Backup and recovery procedures and disaster recovery planning, Data warehousing and analytics pipeline architecture, Real-time data processing and streaming architectures

• **Security Engineering & Best Practices**: OWASP Top 10 vulnerabilities assessment and mitigation, Authentication systems and multi-factor authentication implementation, Authorization frameworks and role-based access control (RBAC), OAuth 2.0, OpenID Connect, and JWT token management, Input validation and sanitization techniques, SQL injection prevention and parameterized queries, Cross-Site Scripting (XSS) protection and Content Security Policy, Cross-Site Request Forgery (CSRF) mitigation strategies, Secure coding practices and code review protocols, Penetration testing methodologies and vulnerability assessment, Encryption at rest and in transit implementation, Security audit procedures and compliance frameworks

• **DevOps & Infrastructure Engineering**: Continuous Integration/Continuous Deployment (CI/CD) pipeline design, Containerization technologies (Docker, Podman) and best practices, Kubernetes orchestration and cluster management, Cloud platform expertise (AWS, Google Cloud Platform, Microsoft Azure), Infrastructure as Code (Terraform, CloudFormation, Pulumi), Configuration management and environment provisioning, Monitoring and alerting system implementation, Log aggregation and analysis (ELK stack, Splunk), Deployment strategies (blue-green, canary, rolling deployments), Service discovery and load balancing configuration, Backup and disaster recovery automation

• **Code Quality & Testing Methodologies**: Static code analysis and linting tool integration, Unit testing frameworks and test coverage analysis, Integration testing strategies and test automation, End-to-end testing and user acceptance testing, Test-driven development (TDD) and behavior-driven development (BDD), Code review processes and peer review best practices, Technical debt management and refactoring strategies, Documentation standards and API documentation, Code metrics analysis and quality gates, Continuous code quality monitoring and improvement

• **Programming Paradigms & Language Expertise**: Object-oriented programming principles and design patterns, Functional programming concepts and immutable data structures, Reactive programming and asynchronous processing patterns, Concurrent programming and thread-safe code design, Multiple programming language expertise (Java, Python, JavaScript/TypeScript, Go, Rust, C#), Framework knowledge and best practice implementation, Memory management and resource optimization, Error handling patterns and exception management, Design pattern implementation and appropriate usage, Code organization and module design principles

• **API Design & Integration Architecture**: RESTful API design principles and HTTP best practices, GraphQL schema design and query optimization, API versioning strategies and backward compatibility, OpenAPI/Swagger documentation and specification, Rate limiting and throttling implementation, API security and authentication mechanisms, Third-party API integration and error handling, Webhook implementation and event-driven integrations, Service contract design and API testing strategies, API gateway configuration and request/response transformation`,
                prompt: `You are a technical expert evaluating hackathon projects with deep expertise in software engineering fundamentals.

CORE TECHNICAL EXPERTISE:
• Software Architecture: Microservices, monoliths, event-driven, layered architectures
• Performance Engineering: Profiling, optimization, caching strategies, load balancing
• Database Systems: SQL/NoSQL design, indexing, query optimization, ACID properties
• Security Engineering: Authentication, authorization, input validation, OWASP practices
• DevOps & Infrastructure: CI/CD, containerization, cloud platforms, monitoring
• Code Quality: Static analysis, testing strategies, code review practices
• Programming Paradigms: OOP, functional, reactive programming patterns
• System Design: Scalability, reliability, fault tolerance, distributed systems
• API Design: RESTful services, GraphQL, versioning, documentation
• Frontend Architecture: Component patterns, state management, bundle optimization

DETAILED EVALUATION FRAMEWORK:

1. SOFTWARE ARCHITECTURE (30%):
   - Project structure follows recognized patterns (MVC, MVP, Clean Architecture)
   - Proper separation of concerns and layer isolation
   - Dependency injection and inversion of control implementation
   - Modularity and component reusability
   - Configuration management and environment handling

2. CODE QUALITY & ENGINEERING PRACTICES (25%):
   - Consistent naming conventions and code style adherence
   - Error handling patterns and graceful degradation
   - Input validation and sanitization practices
   - Memory management and resource cleanup
   - Static analysis tool integration and code metrics

3. PERFORMANCE & OPTIMIZATION (25%):
   - Algorithm efficiency and time/space complexity analysis
   - Database query optimization and indexing strategies
   - Caching implementation (Redis, CDN, application-level)
   - Bundle size optimization and lazy loading
   - Profiling evidence and performance monitoring

4. SECURITY & RELIABILITY (20%):
   - Authentication and authorization implementation
   - HTTPS/TLS configuration and security headers
   - SQL injection, XSS, CSRF protection measures
   - Rate limiting and DOS protection
   - Logging, monitoring, and error tracking systems

SCORING CRITERIA:
- 9-10: Enterprise-grade implementation with advanced optimization
- 7-8: Solid engineering with good practices and minor improvements needed
- 5-6: Functional code with some technical debt and missing best practices
- 3-4: Basic functionality but lacks proper architecture and optimization
- 1-2: Poor code quality with significant technical and security issues

Focus on specific technical implementations, not theoretical knowledge. Analyze actual code patterns, database schemas, API designs, and system architecture decisions.`
            },
            {
                id: 'innovation',
                name: '💡 Innovation & Technology Judge',
                description: `Innovation and technology expert with comprehensive expertise across research, development, and commercialization domains:

• **Emerging Technology Landscape**: Artificial Intelligence and Machine Learning (deep learning, neural networks, computer vision, NLP, reinforcement learning), Blockchain and Distributed Ledger Technologies (consensus algorithms, smart contracts, DeFi, NFTs), Internet of Things (edge computing, sensor networks, industrial IoT), Extended Reality (AR/VR/MR, spatial computing, haptic interfaces), Quantum Computing (quantum algorithms, quantum cryptography), Robotics and Automation

• **Research Methodologies & Academic Excellence**: Systematic literature reviews and meta-analysis, Prior art analysis and competitive intelligence, Experimental design and statistical analysis, Peer review processes and academic publication, Grant writing and research funding acquisition, Interdisciplinary collaboration frameworks, Open science and reproducible research practices

• **Intellectual Property & Patent Strategy**: Patent landscape analysis and freedom-to-operate studies, Patent prosecution and portfolio management, Invention disclosure and patent writing, Technology licensing and commercialization strategies, Trade secret protection and know-how management, IP valuation and monetization approaches, Patent litigation and defense strategies

• **Innovation Management & Technology Transfer**: Stage-gate innovation processes and portfolio management, Design thinking methodologies and human-centered design, Lean startup principles and minimum viable product development, Technology readiness level (TRL) assessment, Lab-to-market transition strategies, University-industry partnerships and collaboration models, Open innovation platforms and crowdsourcing

• **Market Analysis & Technology Assessment**: Technology adoption lifecycle and diffusion models, Disruptive innovation theory and market entry strategies, Technology forecasting and trend analysis, Competitive intelligence and market research, Business model innovation and value proposition design, Ecosystem mapping and stakeholder analysis, Technology risk assessment and mitigation

• **Scientific Computing & Research Tools**: Advanced data analysis and visualization techniques, Scientific programming and computational modeling, Research data management and version control, High-performance computing and cloud research platforms, Scientific instrumentation and measurement systems, Laboratory automation and research workflow optimization

• **Cross-Domain Innovation & Convergence**: Biomimicry and nature-inspired innovation, Interdisciplinary research and technology convergence, Systems thinking and complex adaptive systems, Sustainable technology development and circular economy principles, Social innovation and technology for good initiatives, Human-computer interaction and user-centered innovation`,
                prompt: `You are an innovation expert evaluating hackathon projects with deep expertise in technology innovation, research, and breakthrough assessment.

CORE INNOVATION EXPERTISE:
• Emerging Technologies: AI/ML, blockchain, IoT, AR/VR, quantum computing, edge computing
• Research Methodologies: Literature review, prior art analysis, competitive intelligence
• Patent & IP Analysis: Patent landscaping, freedom to operate, invention assessment
• Technology Transfer: Lab-to-market transition, commercialization strategies
• Innovation Frameworks: Design thinking, lean startup, stage-gate processes
• Market Analysis: Technology adoption curves, disruptive innovation theory
• Scientific Method: Hypothesis testing, experimentation, validation approaches
• Technology Assessment: TRL (Technology Readiness Levels), risk assessment
• Cross-Domain Innovation: Biomimicry, interdisciplinary approaches, convergence
• Open Innovation: Collaborative R&D, hackathons, crowdsourcing strategies

DETAILED EVALUATION FRAMEWORK:

1. TECHNICAL NOVELTY & ORIGINALITY (35%):
   - Novel application of existing technologies or algorithms
   - Creative combination of different technical domains
   - Original approach to well-known problems
   - Evidence of prior art research and differentiation
   - Technical risk and potential breakthrough impact

2. PROBLEM IDENTIFICATION & SOLUTION APPROACH (25%):
   - Clear articulation of the problem being solved
   - Evidence of user research and problem validation
   - Innovative solution methodology and approach
   - Consideration of alternative solutions and trade-offs
   - Systems thinking and holistic problem analysis

3. IMPLEMENTATION INNOVATION (20%):
   - Creative use of APIs, libraries, or frameworks
   - Novel data processing or visualization techniques
   - Innovative user interaction or interface design
   - Technical architecture innovations
   - Integration of multiple technologies in new ways

4. SCALABILITY & EXTENSIBILITY POTENTIAL (20%):
   - Technical foundation for scaling to larger problems
   - Modular design enabling future extensions
   - Platform potential and ecosystem opportunities
   - Potential for broader application domains
   - Technical moats and competitive advantages

SCORING CRITERIA:
- 9-10: Breakthrough innovation with significant technical novelty and commercial potential
- 7-8: Strong innovation with clear differentiation and solid technical execution
- 5-6: Moderate innovation with some novel elements but incremental improvements
- 3-4: Limited innovation, mostly applying existing approaches with minor variations
- 1-2: Little to no innovation, standard implementation of common solutions

Focus on technical innovation, not business models. Analyze the actual implementation, algorithms used, data processing techniques, and novel combinations of technologies.`
            },
            {
                id: 'user-experience',
                name: '👤 User Experience & Design Judge',
                description: `User experience design expert with comprehensive expertise across human-centered design, interface development, and digital product strategy:

• **User Research & Psychology**: Qualitative research methodologies (ethnographic studies, contextual interviews, diary studies, card sorting), Quantitative analysis (analytics interpretation, A/B testing, multivariate testing, conversion funnel analysis), Behavioral psychology and cognitive science principles, User persona development and journey mapping, Usability testing protocols and heuristic evaluation, Mental models and information architecture validation, Eye-tracking studies and heat mapping analysis

• **Interface Design & Visual Systems**: Design system architecture and component library development, Typography hierarchy and readability optimization, Color theory application and accessibility compliance, Layout principles and grid system implementation, Icon design and visual language consistency, Brand integration and visual identity systems, Responsive design patterns and breakpoint strategy, Animation principles and micro-interaction design

• **Accessibility & Inclusive Design**: WCAG 2.1 AA/AAA compliance and implementation strategies, Screen reader optimization and assistive technology compatibility, Keyboard navigation patterns and focus management, Color contrast analysis and alternative communication methods, Cognitive accessibility and plain language principles, International accessibility standards and localization considerations, Disability inclusion research and testing methodologies, Universal design principles and multi-modal interface development

• **Frontend Implementation & Performance**: Semantic HTML structure and progressive enhancement strategies, CSS architecture methodologies (BEM, OOCSS, CSS-in-JS), JavaScript framework integration and component optimization, Performance optimization and Core Web Vitals improvement, Cross-browser compatibility and graceful degradation, Mobile-first responsive implementation and touch interface design, Progressive Web App development and offline functionality, Bundle optimization and lazy loading strategies

• **User Experience Strategy & Business Impact**: Conversion rate optimization and user acquisition funnels, Product-market fit validation through user feedback loops, Design thinking workshops and collaborative ideation processes, Service design and omnichannel experience mapping, Design ROI measurement and business impact analysis, Stakeholder alignment and design advocacy strategies, Agile UX integration and design sprint facilitation, Competitive analysis and design trend research

• **Interaction Design & Prototyping**: Information architecture and navigation system design, Wireframing and low-fidelity prototyping methodologies, High-fidelity interactive prototype development, User flow optimization and task completion analysis, Progressive disclosure and content hierarchy strategies, Error handling and edge case design patterns, Feedback system design and notification strategies, Onboarding experience design and user activation patterns

• **Design Tools & Technology Integration**: Advanced proficiency in design tools (Figma, Sketch, Adobe Creative Suite), Prototyping platforms and interactive design systems, Version control for design files and collaborative workflows, Design handoff processes and developer collaboration tools, User testing platforms and research analysis software, Analytics integration and user behavior tracking setup, Design documentation and style guide maintenance systems`,
                prompt: `You are a UX expert evaluating hackathon projects with deep expertise in user experience design, research methodologies, and human-computer interaction.

CORE UX EXPERTISE:
• UX Research: User interviews, usability testing, A/B testing, eye tracking, analytics
• Interaction Design: Wireframing, prototyping, user flows, information architecture
• Visual Design: Typography, color theory, layout principles, design systems
• Accessibility: WCAG standards, screen readers, keyboard navigation, inclusive design
• Mobile UX: Responsive design, touch interfaces, mobile-first principles
• Frontend Technologies: HTML/CSS best practices, component libraries, CSS frameworks
• Usability Heuristics: Nielsen's principles, cognitive load theory, Fitts' law
• Design Psychology: Cognitive biases, decision-making, motivation, behavior patterns
• Design Systems: Style guides, component libraries, design tokens, consistency
• User Testing: Moderated/unmoderated testing, task analysis, metrics collection

DETAILED EVALUATION FRAMEWORK:

1. USER INTERFACE DESIGN & USABILITY (30%):
   - Clear visual hierarchy and information architecture
   - Consistent design patterns and component usage
   - Appropriate typography, spacing, and color choices
   - Intuitive navigation and menu structures
   - Form design and input validation patterns

2. ACCESSIBILITY & INCLUSIVE DESIGN (25%):
   - WCAG compliance and screen reader compatibility
   - Keyboard navigation and focus management
   - Color contrast ratios and alternative text
   - Support for different abilities and devices
   - Internationalization and localization considerations

3. INTERACTION DESIGN & USER FLOWS (25%):
   - Task completion efficiency and error rates
   - Logical information architecture and user journeys
   - Appropriate feedback and status indicators
   - Progressive disclosure and content organization
   - Responsive behavior across different screen sizes

4. FRONTEND IMPLEMENTATION QUALITY (20%):
   - Clean, semantic HTML structure
   - Efficient CSS architecture and maintainability
   - Performance optimization and loading states
   - Cross-browser compatibility and testing
   - Mobile responsiveness and touch interactions

SCORING CRITERIA:
- 9-10: Exceptional UX with evidence of user research and testing, enterprise-grade implementation
- 7-8: Strong UX principles with good accessibility and solid frontend implementation
- 5-6: Functional interface with some UX issues and basic responsive design
- 3-4: Basic UI with usability problems and poor accessibility considerations
- 1-2: Poor interface design with significant usability barriers and implementation issues

Focus on concrete UX principles and implementation details. Analyze actual interface elements, user flows, accessibility features, and frontend code quality.`
            }
        ];
    }

    private renderJudges(): void {
        const judgesGrid = document.getElementById('judgesGrid');
        if (!judgesGrid) return;

        judgesGrid.innerHTML = this.judges.map(judge => {
            const summary = this.generateJudgeSummary(judge.description);
            const judgeId = judge.id.replace(/'/g, "\\'");

            return `
                <div class="judge-card" style="position: relative;">
                    <button 
                        onclick="removeJudge('${judgeId}')" 
                        style="position: absolute; top: 8px; right: 8px; background: transparent; color: #cc8b5c; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; z-index: 10;"
                        onmouseover="this.style.background='rgba(255,255,255,0.2)'; this.style.color='white'"
                        onmouseout="this.style.background='transparent'; this.style.color='#cc8b5c'"
                        title="Remove judge"
                    >
                        ×
                    </button>
                    <h3>${judge.name}</h3>
                    <p class="judge-summary">${summary}</p>
                    <details class="judge-details">
                        <summary style="cursor: pointer; color: #cc8b5c; font-size: 14px; margin-top: 8px;">
                            📋 View full description
                        </summary>
                        <div style="margin-top: 8px; padding: 12px; background: #2a2a2a; border-radius: 6px; font-size: 13px; line-height: 1.4; color: #d1d1d1;">
                            ${judge.description.replace(/\n/g, '<br>')}
                        </div>
                    </details>
                </div>
            `;
        }).join('');
    }

    private generateJudgeSummary(description: string): string {
        // Extract key focus areas from the description
        const lines = description.split('\n').filter(line => line.trim());
        const firstLine = lines[0] || description;

        // Look for key phrases that indicate focus areas
        const focusKeywords = [
            'technical', 'innovation', 'creativity', 'user experience', 'design',
            'implementation', 'scalability', 'performance', 'security', 'accessibility',
            'business', 'market', 'impact', 'feasibility', 'presentation', 'code quality',
            'architecture', 'testing', 'documentation', 'team collaboration'
        ];

        const lowerDesc = description.toLowerCase();
        const foundKeywords = focusKeywords.filter(keyword =>
            lowerDesc.includes(keyword)
        ).slice(0, 3);

        if (foundKeywords.length > 0) {
            const keywordText = foundKeywords.join(', ');
            const truncatedFirst = firstLine.length > 100 ?
                firstLine.substring(0, 100) + '...' : firstLine;
            return `Focuses on: ${keywordText}. ${truncatedFirst}`;
        }

        // Fallback: just truncate the first line
        return firstLine.length > 120 ?
            firstLine.substring(0, 120) + '...' : firstLine;
    }

    private renderDroppedSummary(droppedSummary: string[], projectId: string): string {
        let html = '';
        let currentSection = '';
        let sectionItems: { text: string; indent: number }[] = [];

        for (let i = 0; i < droppedSummary.length; i++) {
            const line = droppedSummary[i];
            const trimmedLine = line.trim();

            // Check if this is a section header
            if (trimmedLine.startsWith('📊') || trimmedLine.startsWith('📁') || trimmedLine.startsWith('📄') || trimmedLine.startsWith('📏')) {
                // Close previous section if exists
                if (currentSection && sectionItems.length > 0) {
                    html += this.renderCollapsibleSection(currentSection, sectionItems, projectId);
                    sectionItems = [];
                }

                if (trimmedLine.startsWith('📊')) {
                    // Processing summary is not collapsible
                    html += `<div style="margin-bottom: 8px; font-weight: bold;">${trimmedLine}</div>`;
                    currentSection = '';
                } else {
                    // Start new collapsible section
                    currentSection = trimmedLine;
                }
            } else if (currentSection && trimmedLine) {
                // Add item to current section
                const leadingSpaces = line.length - line.trimStart().length;
                const indentLevel = Math.floor(leadingSpaces / 4);
                sectionItems.push({ text: trimmedLine, indent: indentLevel });
            }
        }

        // Close final section
        if (currentSection && sectionItems.length > 0) {
            html += this.renderCollapsibleSection(currentSection, sectionItems, projectId);
        }

        return html;
    }

    private renderCollapsibleSection(header: string, items: { text: string; indent: number }[], projectId: string): string {
        const sectionId = `section-${projectId}-${header.replace(/[^\w]/g, '')}`;

        const itemsHtml = items.map(item => {
            const indentStyle = item.indent > 0 ? `style="margin-left: ${item.indent * 20}px;"` : '';
            return `<div ${indentStyle}>${item.text}</div>`;
        }).join('');

        return `
            <div style="margin-bottom: 8px;">
                <div 
                    onclick="toggleSection('${sectionId}')" 
                    style="cursor: pointer; font-weight: bold; color: #cc8b5c; padding: 4px 0; user-select: none;"
                    id="toggle-${sectionId}"
                >
                    ▶️ ${header}
                </div>
                <div 
                    id="${sectionId}" 
                    style="display: none; margin-left: 16px; margin-top: 4px;"
                >
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    private renderProjects(): void {
        const projectList = document.getElementById('projectList');
        if (!projectList) return;

        projectList.innerHTML = this.projects.map(project => {
            const projectId = project.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

            console.log(`Rendering project ${project.name}:`, {
                hasDroppedSummary: !!project.droppedSummary,
                droppedSummaryLength: project.droppedSummary?.length,
                droppedSummary: project.droppedSummary
            });

            const droppedInfo = project.droppedSummary && project.droppedSummary.length > 0 ?
                `<div style="font-size: 12px; color: #a8a8a8; width: 100%; overflow: hidden;">
                    <div 
                        onclick="toggleDroppedFiles('${projectId}')" 
                        style="cursor: pointer; color: #cc8b5c; padding: 4px 0; user-select: none;"
                        id="dropped-toggle-${projectId}"
                    >
                        ▶️ View excluded files (${project.droppedSummary.length} categories)
                    </div>
                    <div 
                        id="dropped-content-${projectId}" 
                        style="display: none; margin-top: 4px; padding: 8px 12px; background: #1e1e1e; border-radius: 4px; border-left: 3px solid #cc8b5c; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%;"
                    >
${this.renderDroppedSummary(project.droppedSummary, projectId)}
                    </div>
                </div>` :
                `<div style="font-size: 11px; color: #666;">
                    ✅ No files were excluded during processing
                </div>`;

            return `
                <div class="project-item">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <div style="flex: 1; min-width: 0;">
                            <h4>${project.name}</h4>
                            <p>${project.files.length} files uploaded</p>
                        </div>
                        <button 
                            class="btn" 
                            style="font-size: 12px; padding: 6px 12px; margin-left: 12px; flex-shrink: 0;"
                            onclick="downloadProject('${project.name.replace(/'/g, "\\'")}')"
                        >
                            📥 Download
                        </button>
                    </div>
                    <div style="width: 100%; overflow: hidden;">
                        ${droppedInfo}
                    </div>
                </div>
            `;
        }).join('');
    }

    async downloadProject(projectName: string): Promise<void> {
        const project = this.projects.find(p => p.name === projectName);
        if (!project) {
            this.showError('Project not found');
            return;
        }

        try {
            console.log(`📥 Downloading project: ${projectName} (${project.files.length} files)`);

            // Show progress
            this.showProgress(`Downloading ${project.files.length} files...`);

            // Create ZIP using JSZip
            const JSZip = (window as any).JSZip;
            if (!JSZip) {
                throw new Error('JSZip library not loaded');
            }

            const zip = new JSZip();
            let downloadedFiles = 0;

            // Download each file and add to ZIP
            for (const file of project.files) {
                try {
                    let fileContent: string | ArrayBuffer;

                    if (file.content) {
                        // Legacy format with direct content
                        if (file.type.startsWith('text/') || file.type === 'application/json') {
                            fileContent = file.content;
                        } else {
                            // Base64 encoded binary file
                            fileContent = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
                        }
                    } else if (file.storageUrl) {
                        // Firebase Storage format - download content
                        const response = await fetch(file.storageUrl);
                        if (!response.ok) {
                            console.error(`Failed to download ${file.name}: ${response.status}`);
                            continue;
                        }

                        if (file.type.startsWith('text/') || file.type === 'application/json' ||
                            file.name.endsWith('.js') || file.name.endsWith('.ts') ||
                            file.name.endsWith('.py') || file.name.endsWith('.html') ||
                            file.name.endsWith('.css') || file.name.endsWith('.md')) {
                            fileContent = await response.text();
                        } else {
                            fileContent = await response.arrayBuffer();
                        }
                    } else {
                        console.error(`No content or storage URL for file: ${file.name}`);
                        continue;
                    }

                    // Use original path to preserve folder structure
                    const filePath = file.path.replace(/^\/+/, ''); // Remove leading slashes
                    zip.file(filePath, fileContent);
                    downloadedFiles++;

                    // Update progress
                    this.updateProgress(`Downloaded ${downloadedFiles}/${project.files.length} files...`);

                } catch (fileError) {
                    console.error(`Error downloading file ${file.name}:`, fileError);
                    // Continue with other files
                }
            }

            // Add README with project info
            const readmeContent = `# ${projectName}

This ZIP contains the original project files with their folder structure preserved.

Downloaded: ${new Date().toISOString()}
Total Files: ${downloadedFiles}/${project.files.length}

Files included:
${project.files.map(f => `- ${f.path} (${f.type}, ${f.size} bytes)`).join('\n')}
`;
            zip.file('README.md', readmeContent);

            // Generate ZIP
            this.updateProgress('Creating ZIP file...');
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            // Download ZIP
            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName}-original.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.hideProgress();
            this.showSuccess(`✅ Downloaded: ${projectName}-original.zip (${downloadedFiles} files with original structure)`);

        } catch (error) {
            console.error('❌ Download error:', error);
            this.hideProgress();
            this.showError(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private showProgress(message: string): void {
        const progressDiv = document.getElementById('downloadProgress') || document.createElement('div');
        progressDiv.id = 'downloadProgress';
        progressDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            background: #2a2a2a; color: #f5f5f5; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px; border: 1px solid #3d3d3d;
        `;
        progressDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="spinner" style="width: 16px; height: 16px; border: 2px solid #3d3d3d; border-top: 2px solid #cc8b5c; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <span>${message}</span>
            </div>
        `;
        if (!document.getElementById('downloadProgress')) {
            document.body.appendChild(progressDiv);
        }
    }

    private updateProgress(message: string): void {
        const progressDiv = document.getElementById('downloadProgress');
        if (progressDiv) {
            const span = progressDiv.querySelector('span');
            if (span) span.textContent = message;
        }
    }

    private hideProgress(): void {
        const progressDiv = document.getElementById('downloadProgress');
        if (progressDiv) {
            progressDiv.remove();
        }
    }

    private showUploadProgress(message: string): void {
        const progressDiv = document.getElementById('uploadProgress') || document.createElement('div');
        progressDiv.id = 'uploadProgress';
        progressDiv.style.cssText = `
            position: fixed; top: 80px; right: 20px; z-index: 1000;
            background: #2a2a2a; color: #f5f5f5; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 350px; border: 1px solid #3d3d3d;
        `;
        progressDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="spinner" style="width: 16px; height: 16px; border: 2px solid #3d3d3d; border-top: 2px solid #cc8b5c; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <span>${message}</span>
            </div>
        `;
        if (!document.getElementById('uploadProgress')) {
            document.body.appendChild(progressDiv);
        }
    }

    private updateUploadProgress(message: string): void {
        const progressDiv = document.getElementById('uploadProgress');
        if (progressDiv) {
            const span = progressDiv.querySelector('span');
            if (span) span.textContent = message;
        }
    }

    private hideUploadProgress(): void {
        const progressDiv = document.getElementById('uploadProgress');
        if (progressDiv) {
            progressDiv.remove();
        }
    }

    async uploadProject(): Promise<void> {
        console.log('🚀 DEBUG: uploadProject method called - v2');
        const nameInput = document.getElementById('projectName') as HTMLInputElement;
        const folderInput = document.getElementById('folderUpload') as HTMLInputElement;
        const zipInput = document.getElementById('zipUpload') as HTMLInputElement;
        const uploadSection = document.querySelector('.upload-section') as HTMLElement;

        if (!nameInput.value.trim()) {
            this.showError('Please enter a project name');
            return;
        }

        // Check which upload method has files selected
        const githubMethod = document.getElementById('githubUploadMethod') as HTMLElement;
        const githubInput = document.getElementById('githubUrl') as HTMLInputElement;

        if (githubMethod && githubMethod.style.display !== 'none') {
            // GitHub upload
            if (!githubInput.value.trim()) {
                this.showError('Please enter a GitHub repository URL');
                return;
            }
            return this.uploadGithubRepo(nameInput, githubInput, uploadSection);
        } else if (zipInput.files && zipInput.files.length > 0) {
            // ZIP upload (check if ZIP file is selected)
            console.log('🚀 ZIP upload detected');
            return this.uploadZipFile(nameInput, zipInput, uploadSection);
        } else if (folderInput.files && folderInput.files.length > 0) {
            // Folder upload (check if folder files are selected)
            console.log('🚀 Folder upload detected');
            return this.uploadFolderFiles(nameInput, folderInput, uploadSection);
        } else {
            // No files selected
            this.showError('Please select a folder, ZIP file, or enter a GitHub URL');
            return;
        }
    }

    public restoreUploadForm(uploadSection: HTMLElement): void {
        uploadSection.innerHTML = `
            <div>
                <input type="text" id="projectName" class="upload-input" placeholder="Project Name" />
                
                <!-- Upload Method Buttons -->
                <div style="margin: 16px 0;">
                    <div style="display: flex; gap: 8px; margin-bottom: 12px; justify-content: center;">
                        <button class="tab-btn" onclick="triggerFolderUpload()" id="folderTab">
                            📁 Upload Folder
                        </button>
                        <button class="tab-btn" onclick="triggerZipUpload()" id="zipTab">
                            📦 Upload ZIP File
                        </button>
                        <button class="tab-btn" onclick="triggerGithubUpload()" id="githubTab">
                            🐙 GitHub URL
                        </button>
                    </div>
                    
                    <!-- Hidden file inputs -->
                    <input type="file" id="folderUpload" webkitdirectory directory multiple style="display: none;" />
                    <input type="file" id="zipUpload" accept=".zip" style="display: none;" />
                    
                    <!-- GitHub URL Input (initially hidden) -->
                    <div id="githubUploadMethod" class="upload-method" style="display: none;">
                        <input type="url" id="githubUrl" placeholder="https://github.com/user/repo" class="upload-input" />
                        <div style="font-size: 12px; color: #a8a8a8; margin-top: 4px;">
                            🚀 Enter any public GitHub repository URL. Server will clone and process automatically.
                        </div>
                        <button class="btn" onclick="uploadProject()" style="margin-top: 12px;">Upload from GitHub</button>
                    </div>
                    
                    <!-- Status message for file uploads -->
                    <div id="uploadStatus" style="font-size: 14px; color: #a8a8a8; margin-top: 8px; text-align: center; display: none;"></div>
                    
                    <!-- Main Upload Button -->
                    <div style="display: flex; justify-content: center; margin-top: 16px;">
                        <button class="btn" onclick="uploadProject()" id="mainUploadBtn" style="display: none;">
                            Upload Project
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Re-enable all buttons after form restore
        toggleOtherUploadMethods(true);

        // Re-add event listeners for file inputs since HTML was replaced
        this.initializeFileInputListeners();
    }

    public initializeFileInputListeners(): void {
        // Add file input change listener for immediate feedback
        const fileInput = document.getElementById('folderUpload') as HTMLInputElement;
        if (fileInput) {
            fileInput.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                const fileCount = target.files?.length || 0;

                if (fileCount > 0) {
                    console.log(`📁 Selected ${fileCount.toLocaleString()} files for upload`);

                    // Calculate total size for better feedback
                    let totalSize = 0;
                    if (target.files) {
                        for (let i = 0; i < target.files.length; i++) {
                            totalSize += target.files[i].size;
                        }
                    }
                    const totalSizeMB = totalSize / (1024 * 1024);

                    // Step 1: Show immediate file detection with size info
                    const isLargeFolder = fileCount > 1000 || totalSizeMB > 50;
                    const sizeInfo = totalSizeMB > 1 ? ` (${totalSizeMB.toFixed(1)}MB)` : '';
                    showUploadStatus(`📋 Analyzing ${fileCount.toLocaleString()} files${sizeInfo}...`, false, true);

                    // Step 2: Show processing with timing based on folder size
                    const processingDelay = isLargeFolder ? 300 : 150;
                    setTimeout(() => {
                        const processingMsg = isLargeFolder
                            ? `📊 Processing large folder (${fileCount.toLocaleString()} files)...`
                            : `📊 Processing ${fileCount.toLocaleString()} files for upload...`;
                        showUploadStatus(processingMsg, false, true);
                    }, processingDelay);

                    // Step 3: Show final ready status with upload button
                    const finalDelay = isLargeFolder ? 800 : 600;
                    setTimeout(() => {
                        const statusMessage = `📁 ${fileCount.toLocaleString()} files ready to upload${sizeInfo}`;
                        showUploadStatus(statusMessage, true, false, true);
                    }, finalDelay);

                    // Show additional feedback for very large projects
                    const uploadSection = document.querySelector('.upload-section') as HTMLElement;
                    if (uploadSection && fileCount > 5000) {
                        const feedbackDiv = document.createElement('div');
                        feedbackDiv.style.cssText = `
                            background: #3d2914; 
                            border: 1px solid #cc8b5c; 
                            border-radius: 8px; 
                            padding: 12px; 
                            margin-top: 12px;
                            color: #cc8b5c;
                            font-size: 14px;
                        `;
                        feedbackDiv.innerHTML = `
                            <strong>📊 ${fileCount.toLocaleString()} files selected</strong><br>
                            <small style="color: #a8a8a8;">
                                Large project detected. Files will be filtered during upload.
                            </small>
                        `;

                        // Remove any existing feedback
                        const existingFeedback = uploadSection.querySelector('[data-feedback]');
                        if (existingFeedback) {
                            existingFeedback.remove();
                        }

                        feedbackDiv.setAttribute('data-feedback', 'true');
                        uploadSection.appendChild(feedbackDiv);
                    }
                } else {
                    // No files selected, hide upload button and show different message
                    showUploadStatus('📁 Select a folder to continue', false, false);
                }
            });

            // Add focus event to detect when folder picker dialog opens
            fileInput.addEventListener('focus', () => {
                // Update status when dialog is actually open
                showUploadStatus('📂 Choose a folder from the dialog...', false, true);
            });

            // Add blur event to detect when folder picker dialog closes
            fileInput.addEventListener('blur', () => {
                setTimeout(() => {
                    // If no files were selected after dialog closes, show appropriate message
                    if (!fileInput.files || fileInput.files.length === 0) {
                        showUploadStatus('📁 No folder selected', false, false);
                    }
                }, 100);
            });
        }

        // Add ZIP file input change listener
        const zipInput = document.getElementById('zipUpload') as HTMLInputElement;
        if (zipInput) {
            zipInput.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                const file = target.files?.[0];

                if (file) {
                    console.log(`📦 Selected ZIP file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

                    // Update status message and show upload button + clear button
                    const statusMessage = `📦 ZIP file "${file.name}" ready to upload (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
                    showUploadStatus(statusMessage, true, false, true);
                } else {
                    // No file selected, hide upload button and show different message
                    showUploadStatus('📦 Select a ZIP file to continue', false, false);
                }
            });
        }
    }

    private async uploadGithubRepo(nameInput: HTMLInputElement, githubInput: HTMLInputElement, uploadSection: HTMLElement): Promise<void> {
        const githubUrl = githubInput.value.trim();

        // Validate GitHub URL format
        const githubUrlRegex = /^https?:\/\/(www\.)?github\.com\/[\w\-\.]+\/[\w\-\.]+\/?$/;
        if (!githubUrlRegex.test(githubUrl)) {
            this.showError('Please enter a valid GitHub repository URL (e.g., https://github.com/user/repo)');
            return;
        }

        // Show upload progress for GitHub
        uploadSection.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p><strong>Cloning GitHub repository...</strong></p>
                <p style="font-size: 14px; color: #a8a8a8;">${githubUrl}</p>
                <p style="font-size: 12px; color: #666; margin-top: 8px;">
                    Server is cloning the repository and filtering files automatically
                </p>
            </div>
        `;

        try {
            const requestBody = {
                projectName: nameInput.value.trim(),
                githubUrl: githubUrl,
                uploadType: 'github'
            };

            const response = await fetch(`${this.API_BASE_URL}/api/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            let result;
            try {
                const responseText = await response.text();
                if (responseText.trim().startsWith('<')) {
                    console.error('❌ Server returned HTML instead of JSON:', responseText.substring(0, 200));
                    throw new Error('Server returned an error page instead of JSON. Please check server logs.');
                }
                result = JSON.parse(responseText);
            } catch (parseError) {
                if (parseError instanceof SyntaxError) {
                    console.error('❌ JSON parse error. Server response may not be valid JSON.');
                    throw new Error('Server returned invalid JSON response. Please check if the server is running correctly.');
                } else {
                    throw parseError;
                }
            }

            if (!result.success) {
                throw new Error(result.error || 'GitHub repository upload failed');
            }

            // Add project to local list
            console.log('GitHub result droppedSummary:', result.droppedSummary);
            this.projects.push({
                name: result.projectName,
                files: result.files,
                droppedSummary: result.droppedSummary
            });

            this.showSuccess(`✅ GitHub repository cloned successfully! ${result.files.length} files processed`);

            // Show warnings if any (but let project list handle dropped summary)
            if (result.warnings && result.warnings.length > 0) {
                setTimeout(() => {
                    this.showWarning(result.warnings.join('\n'));
                }, 1000);
            }

            // Clear inputs
            nameInput.value = '';
            githubInput.value = '';
            this.renderProjects();

        } catch (error) {
            console.error('❌ GitHub upload error:', error);
            this.showError(`GitHub repository upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            this.restoreUploadForm(uploadSection);
        }
    }

    private async uploadZipFile(nameInput: HTMLInputElement, zipInput: HTMLInputElement, uploadSection: HTMLElement): Promise<void> {
        const zipFile = zipInput.files![0];
        const projectName = nameInput.value.trim();

        // Show upload progress for ZIP
        uploadSection.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p><strong>Uploading ZIP file: ${zipFile.name}</strong></p>
                <p style="font-size: 14px; color: #a8a8a8;">Size: ${(zipFile.size / 1024 / 1024).toFixed(2)}MB</p>
                <p style="font-size: 12px; color: #666; margin-top: 8px;">
                    Uploading the ZIP file...
                </p>
            </div>
        `;

        try {
            // Upload ZIP file to Firebase Storage first
            const storage = (window as any).firebaseStorage;
            const ref = (window as any).firebaseRef;
            const uploadBytes = (window as any).firebaseUploadBytes;

            const zipPath = `zips/${Date.now()}-${zipFile.name}`;
            const zipRef = ref(storage, zipPath);

            console.log(`📦 Uploading ZIP to Firebase Storage: ${zipPath}`);
            await uploadBytes(zipRef, zipFile);
            console.log(`✅ ZIP uploaded to Firebase Storage successfully`);

            // Update progress
            uploadSection.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p><strong>Processing ZIP file: ${zipFile.name}</strong></p>
                    <p style="font-size: 12px; color: #666; margin-top: 8px;">
                        Server will extract and filter files automatically
                    </p>
                </div>
            `;

            // Now tell the backend to process the ZIP file from Storage
            const response = await fetch(`${this.API_BASE_URL}/api/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uploadType: 'zip',
                    projectName: projectName,
                    zipPath: zipPath,
                    fileName: zipFile.name
                })
            });

            let result: UploadResponse;
            try {
                const responseText = await response.text();

                // Check if response is HTML (error page) instead of JSON
                if (responseText.trim().startsWith('<')) {
                    console.error('❌ Server returned HTML instead of JSON:', responseText.substring(0, 200));
                    throw new Error('Server returned an error page instead of JSON. Please check server logs.');
                }

                result = JSON.parse(responseText) as UploadResponse;
            } catch (parseError) {
                if (parseError instanceof SyntaxError) {
                    console.error('❌ JSON parse error. Server response may not be valid JSON.');
                    throw new Error('Server returned invalid JSON response. Please check if the server is running correctly.');
                } else {
                    throw parseError;
                }
            }

            if (!result.success) {
                throw new Error(result.error || 'ZIP upload failed');
            }

            // Add project to local list
            this.projects.push({
                name: result.projectName,
                files: result.files,
                droppedSummary: result.droppedSummary
            });

            this.showSuccess(`✅ ZIP uploaded successfully! ${result.files.length} files processed`);

            // Show warnings if any (but let project list handle dropped summary)
            if (result.warnings && result.warnings.length > 0) {
                setTimeout(() => {
                    this.showWarning(result.warnings!.join('\n'));
                }, 1000);
            }

            // Clear inputs
            nameInput.value = '';
            zipInput.value = '';
            this.renderProjects();

        } catch (error) {
            console.error('❌ ZIP upload error:', error);

            if (error instanceof Error && error.name === 'AbortError') {
                this.showError('ZIP upload timed out. Please try a smaller file or check your connection.');
            } else {
                this.showError(`ZIP upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        } finally {
            this.restoreUploadForm(uploadSection);
        }
    }

    private async uploadFilesToFirebaseStorage(files: File[], projectName: string, uploadSection: HTMLElement): Promise<ProjectFile[]> {
        const uploadedFiles: ProjectFile[] = [];
        const totalFiles = files.length;

        // Show progress
        uploadSection.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p><strong>Uploading ${totalFiles} files to Firebase Storage...</strong></p>
                <div style="background: #2a2a2a; border-radius: 8px; padding: 12px; margin-top: 12px;">
                    <div style="background: #4a4a4a; border-radius: 4px; height: 20px; overflow: hidden;">
                        <div id="upload-progress" style="background: #cc8b5c; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
                    </div>
                    <p id="upload-status" style="margin: 8px 0 0 0; font-size: 12px; color: #a8a8a8;">Starting upload...</p>
                </div>
            </div>
        `;

        const progressBar = document.getElementById('upload-progress');
        const statusText = document.getElementById('upload-status');

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const progress = ((i + 1) / totalFiles) * 100;

            try {
                // Update progress
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (statusText) statusText.textContent = `Uploading ${file.name} (${i + 1}/${totalFiles})`;

                // Check if Firebase is available
                console.log('🔍 Checking Firebase availability...');
                console.log('Firebase Storage:', !!(window as any).firebaseStorage);
                console.log('Firebase Ref:', !!(window as any).firebaseRef);
                console.log('Firebase UploadBytes:', !!(window as any).firebaseUploadBytes);

                if (!(window as any).firebaseStorage) {
                    throw new Error('Firebase Storage not initialized - check Firebase configuration');
                }

                if (!(window as any).firebaseRef) {
                    throw new Error('Firebase ref function not available');
                }

                if (!(window as any).firebaseUploadBytes) {
                    throw new Error('Firebase uploadBytes function not available');
                }

                // Create storage path
                const timestamp = Date.now();
                const storagePath = `projects/${projectName}/${timestamp}-${file.name}`;

                console.log(`📤 Uploading ${file.name} to ${storagePath}`);

                let downloadURL: string;
                try {
                    const storageRef = (window as any).firebaseRef((window as any).firebaseStorage, storagePath);
                    console.log('✅ Storage ref created:', storageRef);

                    // Upload file
                    console.log('📤 Starting upload...');
                    const snapshot = await (window as any).firebaseUploadBytes(storageRef, file);
                    console.log('✅ Upload complete, getting download URL...');

                    downloadURL = await (window as any).firebaseGetDownloadURL(snapshot.ref);
                    console.log('✅ Download URL obtained:', downloadURL);
                } catch (uploadError) {
                    console.error('❌ Firebase operation failed:', uploadError);
                    throw uploadError;
                }

                // Add to uploaded files
                uploadedFiles.push({
                    name: file.name,
                    type: file.type || this.getFileType(file.name),
                    size: file.size,
                    path: file.webkitRelativePath || file.name,
                    storageUrl: downloadURL,
                    storagePath: storagePath
                });

                console.log(`✅ Uploaded: ${file.name} -> ${downloadURL}`);

            } catch (error) {
                console.error(`❌ Failed to upload ${file.name}:`, error);
                const timestamp = Date.now();
                const errorStoragePath = `projects/${projectName}/${timestamp}-${file.name}`;
                console.error('Error details:', {
                    message: error instanceof Error ? error.message : 'Unknown error',
                    code: (error as any)?.code || 'no-code',
                    firebaseAvailable: !!(window as any).firebaseStorage,
                    firebaseRef: !!(window as any).firebaseRef,
                    firebaseUploadBytes: !!(window as any).firebaseUploadBytes,
                    fileSize: file.size,
                    fileName: file.name,
                    storagePath: errorStoragePath
                });

                // Enhanced error message for debugging
                let errorMessage = 'Upload processing failed';
                if (error instanceof Error) {
                    if (error.message.includes('storage/unknown')) {
                        errorMessage = 'Firebase Storage not properly configured. Please set up Firebase Storage in the console first.';
                    } else if (error.message.includes('permission-denied')) {
                        errorMessage = 'Firebase Storage permission denied. Check storage rules.';
                    } else if (error.message.includes('not initialized')) {
                        errorMessage = 'Firebase Storage not initialized properly.';
                    } else {
                        errorMessage = `Firebase Storage error: ${error.message}`;
                    }
                }

                // For debugging, throw detailed error on first failure
                if (uploadedFiles.length === 0) {
                    throw new Error(errorMessage);
                }
                // Continue with other files after first successful upload
            }
        }

        if (statusText) statusText.textContent = `Upload complete! ${uploadedFiles.length}/${totalFiles} files uploaded.`;

        return uploadedFiles;
    }

    private getFileType(filename: string): string {
        const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
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
            '.md': 'text/markdown',
            '.txt': 'text/plain'
        };
        return typeMap[ext] || 'application/octet-stream';
    }

    private async saveProjectToFirestore(projectName: string, files: ProjectFile[]): Promise<void> {
        try {
            console.log('💾 Attempting to save project metadata to Firestore...');

            // Check if Firestore is available
            if (!(window as any).firebaseFirestore) {
                throw new Error('Firestore not initialized');
            }

            const projectData = {
                name: projectName,
                files: files,
                createdAt: new Date().toISOString(),
                totalFiles: files.length,
                totalSize: files.reduce((sum, f) => sum + f.size, 0)
            };

            console.log('📊 Project data to save:', {
                name: projectData.name,
                totalFiles: projectData.totalFiles,
                totalSize: projectData.totalSize
            });

            const docRef = (window as any).firebaseDoc((window as any).firebaseFirestore, 'projects', projectName);
            console.log('📄 Created document reference for:', projectName);

            await (window as any).firebaseSetDoc(docRef, projectData);

            console.log(`✅ Successfully saved project metadata to Firestore: ${projectName}`);
        } catch (error) {
            console.error('❌ Failed to save project metadata to Firestore:', error);
            console.error('❌ Firestore error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                firebaseFirestore: !!(window as any).firebaseFirestore,
                firebaseDoc: !!(window as any).firebaseDoc,
                firebaseSetDoc: !!(window as any).firebaseSetDoc
            });

            // Show warning to user but don't fail the upload
            this.showWarning(`Files uploaded successfully, but metadata save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async uploadFolderFiles(nameInput: HTMLInputElement, fileInput: HTMLInputElement, uploadSection: HTMLElement): Promise<void> {
        console.log('🔍 uploadFolderFiles called with:', { nameInput, fileInput, uploadSection });
        console.log('🔍 fileInput.files:', fileInput.files);
        console.log('🔍 fileInput.files.length:', fileInput.files?.length);

        // Disable all upload buttons during processing
        toggleOtherUploadMethods(false);
        const mainUploadBtn = document.getElementById('mainUploadBtn') as HTMLButtonElement;
        if (mainUploadBtn) {
            mainUploadBtn.disabled = true;
            mainUploadBtn.style.opacity = '0.5';
        }

        const fileCount = fileInput.files!.length;
        const isLargeUpload = fileCount > 1000;

        // Show immediate feedback with file count
        uploadSection.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p><strong>Preparing ${fileCount.toLocaleString()} files for upload...</strong></p>
                <p style="font-size: 14px; color: #a8a8a8;">Processing and filtering files...</p>
                ${isLargeUpload ? `
                    <div style="background: #3d2914; border: 1px solid #cc8b5c; border-radius: 8px; padding: 12px; margin-top: 12px;">
                        <strong style="color: #cc8b5c;">Large Project Detected (${fileCount.toLocaleString()} files)</strong>
                        <p style="font-size: 12px; color: #a8a8a8; margin: 4px 0 0 0;">
                            This may take a while. Files like node_modules, .git, and hidden folders will be filtered out.
                        </p>
                    </div>
                ` : ''}
                <p style="font-size: 12px; color: #666; margin-top: 8px;">
                    Note: Large projects may be truncated to fit Claude's limits
                </p>
            </div>
        `;

        // Add a timeout warning for very large uploads
        let timeoutWarning: NodeJS.Timeout | null = null;
        if (isLargeUpload) {
            timeoutWarning = setTimeout(() => {
                const loadingDiv = document.querySelector('.loading p:last-child');
                if (loadingDiv) {
                    loadingDiv.innerHTML = `
                        <strong style="color: #cc8b5c;">Still processing... This is taking longer than expected.</strong><br>
                        <span style="font-size: 11px; color: #666;">
                            Large projects with many files (especially node_modules) can take several minutes.
                        </span>
                    `;
                }
            }, 10000); // Show warning after 10 seconds
        }

        try {
            console.log('🔍 Checking nameInput:', nameInput);
            console.log('🔍 nameInput.value:', nameInput?.value);

            if (!nameInput) {
                throw new Error('Project name input not found');
            }

            const projectName = nameInput.value.trim();
            console.log('📝 Project name:', projectName);

            if (!projectName) {
                throw new Error('Please enter a project name');
            }

            // Show processing progress
            this.showUploadProgress(`Processing ${fileInput.files!.length.toLocaleString()} files...`);

            // Filter valid files and track EXACTLY what was filtered with detailed lists
            const validFiles: File[] = [];
            const droppedFolders: Set<string> = new Set();
            const droppedFiles: string[] = [];
            const oversizedFiles: Array<{ name: string; size: number }> = [];
            const filesByDirectory: Record<string, string[]> = {};
            let totalFiles = 0;
            let filteredCount = 0;

            for (let i = 0; i < fileInput.files!.length; i++) {
                const file = fileInput.files![i];
                const filePath = file.webkitRelativePath || file.name;
                totalFiles++;

                // Update progress periodically for large uploads
                if (i % 1000 === 0 && i > 0) {
                    this.updateUploadProgress(`Processing file ${i.toLocaleString()} of ${fileInput.files!.length.toLocaleString()}...`);
                    // Allow UI to update
                    await new Promise(resolve => setTimeout(resolve, 1));
                }

                // Track files by directory for organization
                const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '.';
                if (!filesByDirectory[dir]) {
                    filesByDirectory[dir] = [];
                }
                filesByDirectory[dir].push(file.name);

                // Check if should be filtered by type/path
                if (this.shouldFilterFile(filePath)) {
                    // Track which folders/files were dropped
                    const pathParts = filePath.split('/');
                    let foundDroppedFolder = false;

                    // Check if this file is in a dropped folder (like node_modules)
                    for (let j = 0; j < pathParts.length - 1; j++) {
                        const partialPath = pathParts.slice(0, j + 1).join('/');
                        if (this.shouldFilterFile(partialPath + '/')) {
                            droppedFolders.add(partialPath);
                            foundDroppedFolder = true;
                            break;
                        }
                    }

                    // If not in a dropped folder, it's an individual dropped file
                    if (!foundDroppedFolder) {
                        droppedFiles.push(filePath);
                    }

                    filteredCount++;
                    continue;
                }

                // Check file size
                if (file.size > 10 * 1024 * 1024) { // 10MB limit
                    oversizedFiles.push({ name: filePath, size: file.size });
                    filteredCount++;
                    continue;
                }

                // Check file limit
                if (validFiles.length >= 500) {
                    droppedFiles.push(filePath + ' (file limit reached)');
                    filteredCount++;
                    continue;
                }

                validFiles.push(file);
            }

            // Create detailed dropped summary with actual folder/file lists
            const droppedSummary: string[] = [];
            if (filteredCount > 0) {
                droppedSummary.push(`📊 Processing Summary: ${filteredCount} files excluded from ${totalFiles} total files`);

                // Find common prefix for ALL paths first
                let commonPrefix = '';
                const allPaths = [...Array.from(droppedFolders), ...Object.keys(droppedFiles.length > 0 ? (() => {
                    const filesByDir: Record<string, string[]> = {};
                    droppedFiles.forEach(file => {
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

                // Show dropped folders
                if (droppedFolders.size > 0) {
                    droppedSummary.push(`📁 Excluded folders:`);
                    const folders = Array.from(droppedFolders).sort();
                    folders.forEach(folder => {
                        const cleanFolder = commonPrefix ? folder.replace(commonPrefix, '') : folder;
                        const displayFolder = cleanFolder || folder;
                        droppedSummary.push(`    ${displayFolder}`);
                    });
                }

                // Show dropped files with directory grouping and clean formatting
                if (droppedFiles.length > 0) {
                    const filesByDir: Record<string, string[]> = {};

                    droppedFiles.forEach(file => {
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

                // Show oversized files  
                if (oversizedFiles.length > 0) {
                    droppedSummary.push(`📏 Oversized files:`);
                    oversizedFiles.forEach(f => {
                        const cleanName = commonPrefix ? f.name.replace(commonPrefix, '') : f.name;
                        const displayName = cleanName || f.name;
                        droppedSummary.push(`    ${displayName} (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
                    });
                }
            }

            console.log(`📊 Filtered to ${validFiles.length} files for upload`);

            // Update progress before upload
            this.updateUploadProgress(`Uploading ${validFiles.length} files to Firebase Storage...`);

            // Upload files to Firebase Storage
            const uploadedFiles = await this.uploadFilesToFirebaseStorage(validFiles, projectName, uploadSection);

            // Save project metadata to Firestore
            await this.saveProjectToFirestore(projectName, uploadedFiles);

            // Add to local projects list with dropped summary
            this.projects.push({
                name: projectName,
                files: uploadedFiles,
                droppedSummary: droppedSummary.length > 0 ? droppedSummary : undefined
            });

            this.hideUploadProgress();
            this.showSuccess(`✅ Uploaded ${uploadedFiles.length} files to Firebase Storage!`);
            nameInput.value = '';
            fileInput.value = '';
            this.renderProjects();

        } catch (error) {
            console.error('❌ Upload error details:', error);
            console.error('❌ Error type:', typeof error);
            console.error('❌ Error constructor:', (error as Error)?.constructor?.name);

            // Clear timeout warning
            if (timeoutWarning) {
                clearTimeout(timeoutWarning);
            }

            let errorMessage = 'Upload failed: ';
            if (error instanceof TypeError && error.message.includes('fetch')) {
                errorMessage += 'Cannot connect to server. Make sure the server is running on localhost:3001';
                console.error('❌ Server connection failed. Please check if server is running with: npm run serve');
            } else if (error instanceof Error) {
                errorMessage += error.message;
            } else {
                errorMessage += 'Unknown error occurred';
            }

            console.error('❌ Final error message:', errorMessage);
            this.hideUploadProgress();
            this.showError(errorMessage);
        } finally {
            this.restoreUploadForm(uploadSection);
        }
    }


    private showWarning(message: string): void {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            background: #ff9f43; color: white; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px; word-wrap: break-word;
        `;
        warningDiv.textContent = message;
        document.body.appendChild(warningDiv);

        setTimeout(() => warningDiv.remove(), 7000);
    }

    private showError(message: string): void {
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

    private shouldFilterFile(filePath: string): boolean {
        const lowerPath = filePath.toLowerCase();

        // Filter out common directories that should be ignored
        const ignoredDirs = [
            'node_modules', '.git', '.next', 'dist', 'build', 'target', 'bin', 'obj',
            '__pycache__', '.venv', 'venv', 'env', '.env', 'coverage', '.nyc_output',
            'vendor', 'bower_components', '.gradle', '.mvn', 'out', 'lib', 'libs',
            'packages', 'deps', 'dependencies', 'tmp', 'temp', 'cache', '.cache',
            '.svn', '.hg', '.bzr', '.idea', '.vscode', '.vs', '.pytest_cache',
            '.coverage', 'htmlcov', '.sass-cache', '.nuxt', '.output', 'logs'
        ];

        // Check if path contains any ignored directory
        for (const dir of ignoredDirs) {
            if (lowerPath.includes(`/${dir}/`) || lowerPath.startsWith(`${dir}/`) || lowerPath.endsWith(`/${dir}`)) {
                return true;
            }
        }

        // Filter out hidden files and directories (starting with .)
        const pathParts = filePath.split('/');
        for (const part of pathParts) {
            if (part.startsWith('.') && part !== '.' && part !== '..') {
                // Allow some important dotfiles
                const allowedDotFiles = ['.env.example', '.gitignore', '.gitattributes', '.editorconfig', '.babelrc', '.eslintrc', '.prettierrc'];
                if (!allowedDotFiles.some(allowed => part === allowed || part.startsWith(allowed.split('.')[1]))) {
                    return true;
                }
            }
        }

        // Filter out binary file extensions
        const ignoredExtensions = [
            '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib',
            '.class', '.jar', '.war', '.ear', '.deb', '.rpm', '.dmg', '.iso',
            '.mp4', '.avi', '.mov', '.wmv', '.mp3', '.wav', '.flac', '.aac',
            '.min.js', '.min.css', '.bundle.js', '.chunk.js', '.woff', '.woff2',
            '.ttf', '.eot', '.map', '.lock',
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.svg', '.webp',
            '.ico', '.cur', '.psd', '.ai', '.sketch', '.fig'
        ];

        const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return ignoredExtensions.includes(ext);
    }

    private showSuccess(message: string): void {
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

    async addCustomJudge(): Promise<void> {
        const nameInput = document.getElementById('judgeName') as HTMLInputElement;
        const focusInput = document.getElementById('judgeFocus') as HTMLInputElement;

        // Check which sources are selected
        const useLinkedin = (document.getElementById('linkedinSourceBtn') as HTMLButtonElement).classList.contains('selected');
        const useCv = (document.getElementById('cvSourceBtn') as HTMLButtonElement).classList.contains('selected');
        const useManual = (document.getElementById('manualSourceBtn') as HTMLButtonElement).classList.contains('selected');

        if (!nameInput.value.trim()) {
            this.showError('Please enter a judge name');
            return;
        }

        if (!useLinkedin && !useCv && !useManual) {
            this.showError('Please select at least one source to create the judge');
            return;
        }

        // Collect data from selected sources
        const sources: string[] = [];
        let hasValidData = false;

        if (useLinkedin) {
            const linkedinInput = document.getElementById('linkedinPdfUpload') as HTMLInputElement;
            if (linkedinInput.files && linkedinInput.files[0]) {
                try {
                    const linkedinText = await this.extractTextFromFile(linkedinInput.files[0]);
                    sources.push(`LINKEDIN_PDF:\n${linkedinText}`);
                    hasValidData = true;
                } catch (error) {
                    console.error('Error reading LinkedIn PDF file:', error);
                    this.showError('Failed to read LinkedIn PDF file. Please try again.');
                    return;
                }
            }
        }

        if (useCv) {
            const cvInput = document.getElementById('cvUpload') as HTMLInputElement;
            if (cvInput.files && cvInput.files[0]) {
                try {
                    const cvText = await this.extractTextFromFile(cvInput.files[0]);
                    sources.push(`CV_RESUME:\n${cvText}`);
                    hasValidData = true;
                } catch (error) {
                    console.error('Error reading CV file:', error);
                    this.showError('Failed to read CV file. Please try again.');
                    return;
                }
            }
        }

        if (useManual) {
            const manualInput = document.getElementById('judgePrompt') as HTMLTextAreaElement;
            if (manualInput.value.trim()) {
                sources.push(`MANUAL_DESCRIPTION:\n${manualInput.value.trim()}`);
                hasValidData = true;
            }
        }

        if (!hasValidData) {
            this.showError('Please provide data for at least one selected source');
            return;
        }

        // Show progress
        this.showJudgeCreationProgress('Analyzing provided sources...');

        try {
            // Create AI judge profile using Claude
            const judgeProfile = await this.createAIJudgeProfile(
                nameInput.value.trim(),
                focusInput.value.trim(),
                sources
            );

            // Add the judge to the list
            this.judges.push(judgeProfile);

            // Clear the form
            this.clearCustomJudgeForm();

            // Hide progress
            this.hideJudgeCreationProgress();

            // Show success message
            this.showSuccess(`🤖 Created AI expert judge: ${judgeProfile.name}`);

            // Re-render the judges list
            this.renderJudges();

        } catch (error) {
            this.hideJudgeCreationProgress();
            console.error('Error creating AI judge:', error);
            this.showError(`Failed to create AI judge: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async extractTextFromFile(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error('Failed to read file as text'));
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    private async createAIJudgeProfile(name: string, focus: string, sources: string[]): Promise<Judge> {
        const combinedData = sources.join('\n\n---\n\n');

        const prompt = `You are an expert at creating detailed professional profiles for AI judges in hackathon evaluation systems. 

Based on the following source data, create a comprehensive judge profile:

JUDGE NAME: ${name}
${focus ? `JUDGING FOCUS: ${focus}` : ''}

SOURCE DATA:
${combinedData}

Create a COMPREHENSIVE and DETAILED professional description following this exact format structure:

START with: "[Description of expertise] expert with comprehensive expertise across [relevant domains]:"

Then include 6-10 bullet points, each with the format:
• **[Main Expertise Area]**: [6-10 detailed sub-expertise items separated by commas, each describing specific skills, technologies, methodologies, or domain knowledge]

Examples of the level of detail needed:
• **Technical Architecture & Systems**: Microservices architecture design and orchestration, Event-driven architecture and message queuing systems, Database design optimization and query performance tuning, Cloud infrastructure deployment and scaling strategies, API gateway implementation and service mesh configuration, Container orchestration with Kubernetes and Docker, CI/CD pipeline automation and deployment strategies, Security architecture and penetration testing methodologies

• **Research & Development Methodologies**: Experimental design and hypothesis testing frameworks, Literature review and prior art analysis techniques, Patent landscape analysis and intellectual property assessment, Technology readiness level evaluation and risk assessment, Prototype development and proof-of-concept validation, User research methodologies and data collection techniques, Market analysis and competitive intelligence gathering, Innovation management and technology transfer processes

IMPORTANT REQUIREMENTS:
- Each bullet point must have 6-10 detailed technical/professional items
- Use specific technical terms, methodologies, tools, and domain knowledge
- Make it sound like a world-class expert with deep specialized knowledge
- Focus on areas relevant to hackathon project evaluation
- Match the comprehensive depth of default system judges
- Do NOT include evaluation frameworks or scoring criteria - just expertise description

Write ONLY the comprehensive description text. Do not include JSON, headers, or other formatting.`;

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/claude`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    seed: this.CLAUDE_API_SEED
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to create judge profile');
            }

            // Use the plain text response as the description and create a simple prompt
            const description = result.response.trim();

            // Create a comprehensive evaluation prompt based on the focus area and expertise
            const evaluationPrompt = focus ?
                `You are an expert hackathon judge specializing in ${focus} with the comprehensive background described above. 

EVALUATION FOCUS: ${focus}

Apply your specialized expertise to evaluate hackathon projects with particular attention to ${focus.toLowerCase()} aspects. Consider technical implementation quality, innovation potential, scalability, and practical impact within your domain of expertise.

EVALUATION CRITERIA:
1. Technical Excellence (30%): Implementation quality, architectural decisions, code standards
2. Innovation & Creativity (25%): Novel approaches, creative solutions, breakthrough potential  
3. Practical Impact (25%): Real-world applicability, user value, market potential
4. Implementation Quality (20%): Completeness, robustness, production readiness

Provide detailed analysis covering:
- Specific technical strengths and innovations observed
- Areas where expertise in ${focus} adds unique value assessment
- Potential improvements from your specialized perspective
- Overall assessment of project quality and potential

Conclude with a numerical score (1-10) based on your expert evaluation criteria.` :
                `You are an expert hackathon judge with the comprehensive background and expertise described above.

Apply your specialized knowledge to thoroughly evaluate hackathon projects across multiple dimensions of quality and innovation.

EVALUATION CRITERIA:
1. Technical Excellence (30%): Implementation quality, architectural decisions, code standards
2. Innovation & Creativity (25%): Novel approaches, creative solutions, breakthrough potential  
3. Practical Impact (25%): Real-world applicability, user value, market potential
4. Implementation Quality (20%): Completeness, robustness, production readiness

Provide detailed analysis covering:
- Technical strengths and innovative aspects from your expert perspective
- Assessment of practical value and real-world applicability
- Evaluation of implementation quality and architectural decisions
- Potential improvements and recommendations for enhancement

Conclude with a numerical score (1-10) based on your comprehensive expert evaluation.`;

            return {
                id: `ai-${Date.now()}`,
                name: name,
                description: description,
                prompt: evaluationPrompt
            };

        } catch (error) {
            console.error('Error creating AI judge profile:', error);
            throw new Error('Failed to generate AI judge profile');
        }
    }

    private showJudgeCreationProgress(status: string): void {
        const progressDiv = document.getElementById('judgeCreationProgress') as HTMLElement;
        const statusSpan = document.getElementById('judgeCreationStatus') as HTMLElement;

        if (progressDiv) progressDiv.style.display = 'block';
        if (statusSpan) statusSpan.textContent = status;
    }

    private hideJudgeCreationProgress(): void {
        const progressDiv = document.getElementById('judgeCreationProgress') as HTMLElement;
        if (progressDiv) progressDiv.style.display = 'none';
    }

    private clearCustomJudgeForm(): void {
        // Clear name and focus inputs
        const nameInput = document.getElementById('judgeName') as HTMLInputElement;
        const focusInput = document.getElementById('judgeFocus') as HTMLInputElement;
        if (nameInput) nameInput.value = '';
        if (focusInput) focusInput.value = '';

        // Reset to default state: only manual selected
        const buttons = ['linkedinSourceBtn', 'cvSourceBtn', 'manualSourceBtn'];
        const sections = ['linkedinSection', 'cvSection', 'manualSection'];

        buttons.forEach(id => {
            const button = document.getElementById(id) as HTMLButtonElement;
            if (button) {
                if (id === 'manualSourceBtn') {
                    button.classList.add('selected');
                } else {
                    button.classList.remove('selected');
                }
            }
        });

        sections.forEach(id => {
            const section = document.getElementById(id) as HTMLElement;
            if (section) {
                if (id === 'manualSection') {
                    section.style.display = 'block';
                } else {
                    section.style.display = 'none';
                }
            }
        });

        // Clear individual inputs
        const linkedinInput = document.getElementById('linkedinPdfUpload') as HTMLInputElement;
        const cvInput = document.getElementById('cvUpload') as HTMLInputElement;
        const manualInput = document.getElementById('judgePrompt') as HTMLTextAreaElement;

        if (linkedinInput) linkedinInput.value = '';
        if (cvInput) cvInput.value = '';
        if (manualInput) manualInput.value = '';
    }

    removeJudge(judgeId: string): void {
        // Safety check: don't allow removing all judges
        if (this.judges.length <= 1) {
            this.showError('Cannot remove the last judge. You need at least one judge for the competition.');
            return;
        }

        // Find the judge to remove
        const judgeToRemove = this.judges.find(judge => judge.id === judgeId);
        if (!judgeToRemove) {
            this.showError('Judge not found');
            return;
        }

        // Confirm removal for default judges
        const isDefaultJudge = ['technical', 'innovation', 'user-experience'].includes(judgeId);
        if (isDefaultJudge) {
            const confirmed = confirm(`Are you sure you want to remove the default "${judgeToRemove.name}" judge?`);
            if (!confirmed) {
                return;
            }
        }

        this.judges = this.judges.filter(judge => judge.id !== judgeId);
        this.showSuccess(`✅ Removed judge: ${judgeToRemove.name}`);
        this.renderJudges();
    }

    private async callClaudeAPI(prompt: string): Promise<string> {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/claude`, {
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

            const data = await response.json() as ClaudeAPIResponse;

            if (!data.success) {
                throw new Error(data.error || 'API call failed');
            }

            return data.response;
        } catch (error) {
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
    }

    private async downloadFileFromStorage(storageUrl: string): Promise<string> {
        try {
            console.log('📥 Downloading file from storage URL:', storageUrl);

            const response = await fetch(storageUrl);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error('Error downloading file from storage:', error);
            return '[Error: Could not download file content]';
        }
    }

    private async formatProjectForJudge(project: Project): Promise<string> {
        let formatted = `Project: ${project.name}\n\nFiles and Contents:\n\n`;
        const maxSize = 7 * 1024 * 1024; // 7MB limit for formatted content
        let currentSize = formatted.length;
        let truncatedFiles = 0;

        const sortedFiles = [...project.files].sort((a, b) => {
            // Prioritize important files (README, main files, config files)
            const getPriority = (filename: string) => {
                const name = filename.toLowerCase();
                if (name.includes('readme')) return 1;
                if (name.includes('main') || name.includes('index')) return 2;
                if (name.includes('config') || name.includes('package.json')) return 3;
                if (name.endsWith('.md')) return 4;
                if (name.endsWith('.py') || name.endsWith('.js') || name.endsWith('.ts')) return 5;
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

                let content: string;

                // Handle both legacy content and Firebase Storage URLs
                if (file.content) {
                    // Legacy format with direct content
                    content = file.content;
                } else if (file.storageUrl) {
                    // Firebase Storage format - download content
                    content = await this.downloadFileFromStorage(file.storageUrl);
                } else {
                    content = '[Error: No content or storage URL available]';
                }

                // Truncate very large files
                if (content.length > 50000) {
                    content = content.substring(0, 50000) + '\n... [FILE TRUNCATED - TOO LARGE] ...\n';
                }

                fileContent += content + '\n\n';
            } else {
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

    async startJudging(): Promise<void> {
        try {
            if (this.projects.length === 0) {
                this.showError('Please upload at least one project');
                return;
            }

            if (this.judges.length === 0) {
                this.showError('No judges available');
                return;
            }

            const startButton = document.getElementById('startJudging') as HTMLButtonElement;
            const progressDiv = document.getElementById('judgingProgress');

            startButton.disabled = true;
            progressDiv?.classList.remove('hidden');

            this.evaluations = [];

            console.log(`🏁 Starting judging process for ${this.projects.length} projects with ${this.judges.length} judges`);

            // Process each project with comprehensive error handling
            for (const project of this.projects) {
                try {
                    const projectEvaluation: ProjectEvaluation = {
                        projectName: project.name,
                        judgeResults: []
                    };

                    console.log(`📊 Evaluating project: ${project.name}`);

                    const projectData = await this.formatProjectForJudge(project);

                    // Get evaluations from all judges in parallel
                    const judgePromises = this.judges.map(async (judge) => {
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
                            const response = await this.callClaudeAPI(fullPrompt);
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
                        } catch (error) {
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
                    });

                    projectEvaluation.judgeResults = await Promise.all(judgePromises);
                    this.evaluations.push(projectEvaluation);

                } catch (projectError) {
                    console.error(`❌ Error processing project ${project.name}:`, projectError);

                    // Add project with fallback evaluation
                    const fallbackEvaluation: ProjectEvaluation = {
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
                await this.getFinalRanking();
            } catch (masterError) {
                console.error(`❌ Master judge failed, using fallback ranking:`, masterError);
                // Fallback ranking already handled in getFinalRanking
            }

            console.log(`🏆 Judging process completed successfully`);

        } catch (error) {
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

        } finally {
            // Always re-enable UI and show results
            const startButton = document.getElementById('startJudging') as HTMLButtonElement;
            const progressDiv = document.getElementById('judgingProgress');

            if (startButton) startButton.disabled = false;
            progressDiv?.classList.add('hidden');

            // Always display results, even if partial/fallback
            this.displayResults();
        }
    }

    private async getFinalRanking(): Promise<void> {
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
            const response = await this.callClaudeAPI(masterPrompt);
            const masterEvaluation = JSON.parse(response);

            // Validate master evaluation structure
            if (masterEvaluation.rankings && Array.isArray(masterEvaluation.rankings)) {
                // Apply final rankings
                masterEvaluation.rankings.forEach((ranking: any) => {
                    const evaluation = this.evaluations.find(evalItem => evalItem.projectName === ranking.projectName);
                    if (evaluation && typeof ranking.rank === 'number') {
                        evaluation.finalRank = ranking.rank;
                    }
                });

                // Sort evaluations by final rank
                this.evaluations.sort((a, b) => (a.finalRank || 999) - (b.finalRank || 999));
            } else {
                throw new Error('Invalid master evaluation response structure');
            }

        } catch (error) {
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
                    const getAvgScore = (evaluation: ProjectEvaluation) => {
                        if (!evaluation.judgeResults || evaluation.judgeResults.length === 0) return 0;
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

            } catch (fallbackError) {
                console.error('❌ Even fallback ranking failed, using project order:', fallbackError);
                // Final fallback: just number them in order
                this.evaluations.forEach((evaluation, index) => {
                    evaluation.finalRank = index + 1;
                });
            }
        }
    }

    private displayResults(): void {
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
                } catch (itemError) {
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

        } catch (error) {
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
function uploadProject(): void {
    console.log('🚀 uploadProject() called');
    hackathonJudge.uploadProject().catch(error => {
        console.error('❌ Upload failed:', error);
    });
}

// Global functions for upload method triggers
function triggerFolderUpload(): void {
    const folderTab = document.getElementById('folderTab') as HTMLButtonElement;

    // Check if tab is disabled
    if (folderTab.disabled) {
        return;
    }

    // Reset all tabs
    resetUploadTabs();

    // Activate folder tab
    folderTab.classList.add('active');

    // Phase 1: Initial feedback
    showUploadStatus('Opening folder picker...', false, true);

    // Add loading state to button
    folderTab.innerHTML = '⏳ Opening...';
    folderTab.disabled = true;

    // Track timing for better user feedback
    const startTime = Date.now();
    let hasUserInteracted = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Phase 2: Setup file input detection
    const folderInput = document.getElementById('folderUpload') as HTMLInputElement;

    // Detect when user completes file selection
    const detectUserInteraction = () => {
        if (!hasUserInteracted) {
            hasUserInteracted = true;
            showUploadStatus('Folder selected! Processing files...', false, true);
            clearTimeout(timeoutId);
        }
    };

    // Listen for file selection completion
    folderInput.addEventListener('change', detectUserInteraction, { once: true });

    // Phase 3: Setup progressive feedback
    timeoutId = setTimeout(() => {
        if (!hasUserInteracted) {
            showUploadStatus('Waiting for folder selection... If you see a permission dialog, please allow access.', false, true);

            // Set up follow-up timeout for continued waiting
            timeoutId = setTimeout(() => {
                if (!hasUserInteracted) {
                    showUploadStatus('Still waiting for folder selection (large folders may take time a few minutes to load)...', false, true);
                }
            }, 8000);
        }
    }, 2000);

    // Trigger folder selection with delay to show feedback
    setTimeout(() => {
        folderInput.click();

        // Reset button after a moment
        setTimeout(() => {
            folderTab.innerHTML = '📁 Upload Folder';
            folderTab.disabled = false;
        }, 1000);
    }, 100);

    // Don't show upload button until files are selected
}

function triggerZipUpload(): void {
    const zipTab = document.getElementById('zipTab') as HTMLButtonElement;

    // Check if tab is disabled
    if (zipTab.disabled) {
        return;
    }

    // Reset all tabs
    resetUploadTabs();

    // Activate ZIP tab
    zipTab.classList.add('active');

    // Show loading message while ZIP picker opens
    showUploadStatus('📂 Opening ZIP file picker...', false, true);

    // Add loading state to button
    zipTab.innerHTML = '⏳ Opening...';
    zipTab.disabled = true;

    // Trigger ZIP file selection with delay to show feedback
    setTimeout(() => {
        const zipInput = document.getElementById('zipUpload') as HTMLInputElement;
        if (zipInput) {
            // Ensure event listener is attached before clicking
            if ((window as any).hackathonJudge) {
                (window as any).hackathonJudge.initializeFileInputListeners();
            }
            zipInput.click();
        } else {
            console.error('❌ ZIP input element not found');
            showUploadStatus('❌ ZIP input not found', false, false);
        }

        // Reset button after a moment
        setTimeout(() => {
            zipTab.innerHTML = '📦 Upload ZIP File';
            zipTab.disabled = false;
        }, 1000);
    }, 100);
}

function triggerGithubUpload(): void {
    const githubTab = document.getElementById('githubTab') as HTMLButtonElement;

    // Check if tab is disabled
    if (githubTab.disabled) {
        return;
    }

    // Reset all tabs
    resetUploadTabs();

    // Activate GitHub tab
    githubTab.classList.add('active');

    // Show GitHub input section
    const githubMethod = document.getElementById('githubUploadMethod') as HTMLElement;
    githubMethod.style.display = 'block';

    // Focus on the GitHub URL input
    setTimeout(() => {
        const githubInput = document.getElementById('githubUrl') as HTMLInputElement;
        githubInput.focus();
    }, 100);
}

function toggleJudgeSourceButton(source: 'linkedin' | 'cv' | 'manual'): void {
    const sectionId = source + 'Section';
    const buttonId = source + 'SourceBtn';

    const section = document.getElementById(sectionId) as HTMLElement;
    const button = document.getElementById(buttonId) as HTMLButtonElement;

    if (section && button) {
        // Toggle button selection state
        const isSelected = button.classList.contains('selected');

        if (isSelected) {
            // Deselect: remove selected class and hide section
            button.classList.remove('selected');
            section.style.display = 'none';

            // Clear the input when deselected
            if (source === 'linkedin') {
                const linkedinInput = document.getElementById('linkedinPdfUpload') as HTMLInputElement;
                if (linkedinInput) linkedinInput.value = '';
            } else if (source === 'cv') {
                const cvInput = document.getElementById('cvUpload') as HTMLInputElement;
                if (cvInput) cvInput.value = '';
            } else if (source === 'manual') {
                const manualInput = document.getElementById('judgePrompt') as HTMLTextAreaElement;
                if (manualInput) manualInput.value = '';
            }
        } else {
            // Select: add selected class and show section
            button.classList.add('selected');
            section.style.display = 'block';
        }
    }
}

function resetUploadTabs(): void {
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => tab.classList.remove('active'));

    // Hide GitHub method
    const githubMethod = document.getElementById('githubUploadMethod') as HTMLElement;
    if (githubMethod) {
        githubMethod.style.display = 'none';
    }

    // Hide status messages
    const uploadStatus = document.getElementById('uploadStatus') as HTMLElement;
    if (uploadStatus) {
        uploadStatus.style.display = 'none';
    }

    // Hide main upload button
    const mainUploadBtn = document.getElementById('mainUploadBtn') as HTMLElement;
    if (mainUploadBtn) {
        mainUploadBtn.style.display = 'none';
    }

    // Hide clear button
    const clearBtn = document.getElementById('clearUploadBtn') as HTMLElement;
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }

    // Re-enable all upload methods
    toggleOtherUploadMethods(true);
}

function toggleOtherUploadMethods(enable: boolean): void {
    const folderTab = document.getElementById('folderTab') as HTMLButtonElement;
    const zipTab = document.getElementById('zipTab') as HTMLButtonElement;
    const githubTab = document.getElementById('githubTab') as HTMLButtonElement;

    // Get currently active tab
    const activeTab = document.querySelector('.tab-btn.active');

    [folderTab, zipTab, githubTab].forEach(tab => {
        if (tab && tab !== activeTab) {
            tab.disabled = !enable;
            tab.style.opacity = enable ? '1' : '0.5';
            tab.style.cursor = enable ? 'pointer' : 'not-allowed';
        }
    });
}

function clearUpload(): void {
    // Clear file inputs
    const folderInput = document.getElementById('folderUpload') as HTMLInputElement;
    const zipInput = document.getElementById('zipUpload') as HTMLInputElement;
    const githubInput = document.getElementById('githubUrl') as HTMLInputElement;

    if (folderInput) folderInput.value = '';
    if (zipInput) zipInput.value = '';
    if (githubInput) githubInput.value = '';

    // Reset the upload interface
    resetUploadTabs();

    // Clear upload status
    showUploadStatus('', false, false, false);

    // Re-enable upload buttons
    toggleOtherUploadMethods(true);

    // Restore the original upload form if it was replaced
    const uploadSection = document.querySelector('.upload-section') as HTMLElement;
    if (uploadSection) {
        // Check if the form was replaced with loading content
        if (!document.getElementById('projectName') || !document.getElementById('folderUpload')) {
            // Restore the original form using the HackathonJudge instance
            if ((window as any).hackathonJudge) {
                (window as any).hackathonJudge.restoreUploadForm(uploadSection);
            }
        } else {
            // Just clear any feedback divs
            const existingFeedback = uploadSection.querySelector('[data-feedback]');
            if (existingFeedback) {
                existingFeedback.remove();
            }
        }
    }
}

function showUploadStatus(message: string, showUploadBtn: boolean = true, showSpinner: boolean = false, showClearBtn: boolean = false): void {
    const uploadStatus = document.getElementById('uploadStatus') as HTMLElement;
    const mainUploadBtn = document.getElementById('mainUploadBtn') as HTMLElement;

    if (uploadStatus) {
        if (showSpinner) {
            uploadStatus.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <div class="mini-spinner"></div>
                    <span>${message}</span>
                </div>
            `;
        } else {
            uploadStatus.innerHTML = message;
        }
        uploadStatus.style.display = 'block';
    }

    if (mainUploadBtn) {
        mainUploadBtn.style.display = showUploadBtn ? 'block' : 'none';
    }

    // Handle clear button
    const clearBtn = document.getElementById('clearUploadBtn') as HTMLElement;
    if (clearBtn) {
        clearBtn.style.display = showClearBtn ? 'block' : 'none';
    } else if (showClearBtn) {
        // Create clear button if it doesn't exist
        const clearButton = document.createElement('button');
        clearButton.id = 'clearUploadBtn';
        clearButton.className = 'btn';
        clearButton.style.cssText = `
            background: #666; 
            margin-top: 8px; 
            font-size: 14px; 
            padding: 8px 16px;
        `;
        clearButton.innerHTML = '🗑️ Clear & Upload Something Else';
        clearButton.onclick = clearUpload;

        const uploadBtnContainer = mainUploadBtn?.parentElement;
        if (uploadBtnContainer) {
            uploadBtnContainer.appendChild(clearButton);
        }
    }

    // Disable/enable other upload tabs based on selection state
    toggleOtherUploadMethods(!showClearBtn);
}

function toggleDroppedFiles(projectId: string): void {
    const content = document.getElementById(`dropped-content-${projectId}`);
    const toggle = document.getElementById(`dropped-toggle-${projectId}`);

    if (content && toggle) {
        const categoriesText = toggle.innerHTML.includes('categories') ?
            toggle.innerHTML.match(/\((\d+) categories\)/)?.[0] || '' : '';

        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            toggle.innerHTML = `🔽 Hide excluded files ${categoriesText}`;
        } else {
            content.style.display = 'none';
            toggle.innerHTML = `▶️ View excluded files ${categoriesText}`;
        }
    }
}

function addCustomJudge(): void {
    hackathonJudge.addCustomJudge();
}

function removeJudge(judgeId: string): void {
    hackathonJudge.removeJudge(judgeId);
}

function startJudging(): void {
    console.log('🚀 startJudging() called');
    hackathonJudge.startJudging().catch(error => {
        console.error('❌ Judging failed:', error);
    });
}

function downloadProject(projectName: string): void {
    console.log('📥 downloadProject() called for:', projectName);
    hackathonJudge.downloadProject(projectName).catch(error => {
        console.error('❌ Download failed:', error);
    });
}

function toggleSection(sectionId: string): void {
    const content = document.getElementById(sectionId);
    const toggle = document.getElementById(`toggle-${sectionId}`);

    if (content && toggle) {
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            toggle.innerHTML = toggle.innerHTML.replace('▶️', '🔽');
        } else {
            content.style.display = 'none';
            toggle.innerHTML = toggle.innerHTML.replace('🔽', '▶️');
        }
    }
}

function toggleResult(projectName: string): void {
    const resultContent = document.getElementById(`result-${projectName}`);
    if (resultContent) {
        resultContent.classList.toggle('active');
    }
}

function switchTab(projectName: string, tabIndex: number): void {
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

// Global function for switching upload methods
function switchUploadMethod(method: 'folder' | 'zip' | 'github'): void {
    const folderMethod = document.getElementById('folderUploadMethod');
    const zipMethod = document.getElementById('zipUploadMethod');
    const githubMethod = document.getElementById('githubUploadMethod');
    const folderTab = document.getElementById('folderTab');
    const zipTab = document.getElementById('zipTab');
    const githubTab = document.getElementById('githubTab');

    // Hide all methods
    folderMethod!.style.display = 'none';
    zipMethod!.style.display = 'none';
    githubMethod!.style.display = 'none';

    // Remove active from all tabs
    folderTab!.classList.remove('active');
    zipTab!.classList.remove('active');
    githubTab!.classList.remove('active');

    // Show selected method and activate tab
    if (method === 'folder') {
        folderMethod!.style.display = 'block';
        folderTab!.classList.add('active');
    } else if (method === 'zip') {
        zipMethod!.style.display = 'block';
        zipTab!.classList.add('active');
    } else if (method === 'github') {
        githubMethod!.style.display = 'block';
        githubTab!.classList.add('active');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing HackathonJudge app...');

    // Initialize the app (this will also set up file input listeners)
    (window as any).hackathonJudge = new HackathonJudge();
});