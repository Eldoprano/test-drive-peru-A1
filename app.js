// Global State
let quizData = [];
let userProgress = {};
let currentMode = null;
let currentQuestionIndex = 0;
let currentQuestion = null;
let questionStartTime = null;
let testStartTime = null;
let testTimerInterval = null;
let questionSequence = [];
let deferredPrompt = null; // For PWA install prompt
let questionsAnsweredCount = 0; // Counter for random and sequential modes
let recentQuestions = []; // Buffer to prevent immediate repetition
const RECENT_WINDOW_SIZE = 15;

// History Management
let questionHistory = [];
let historyIndex = 0;
let liveQuestionState = null;
let currentQuestionState = null;

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    icon.textContent = theme === 'light' ? '🌙' : '☀️';
}

// Data Loading
async function loadQuizData() {
    try {
        const response = await fetch('quiz_data.json');
        quizData = await response.json();

        // Normalize question IDs to be sequential 1-200
        quizData = quizData.slice(0, 200).map((q, index) => ({
            ...q,
            questionNumber: index + 1
        }));

        loadUserProgress();
        checkResumeAvailable();
        console.log(`Loaded ${quizData.length} questions`);
    } catch (error) {
        console.error('Error loading quiz data:', error);
        alert('Failed to load quiz data. Please refresh the page.');
    }
}

// User Progress Management
function loadUserProgress() {
    const saved = localStorage.getItem('userProgress');
    if (saved) {
        userProgress = JSON.parse(saved);
    } else {
        userProgress = {};
        quizData.forEach(q => {
            userProgress[q.questionNumber] = {
                seen: false,
                correct: 0,
                incorrect: 0,
                totalTime: 0,
                attempts: 0
            };
        });
        saveUserProgress();
    }

    const savedRecent = localStorage.getItem('recentQuestions');
    if (savedRecent) {
        try {
            recentQuestions = JSON.parse(savedRecent);
        } catch (e) {
            recentQuestions = [];
        }
    }
}

function saveUserProgress() {
    localStorage.setItem('userProgress', JSON.stringify(userProgress));
    localStorage.setItem('recentQuestions', JSON.stringify(recentQuestions));
}

function updateQuestionProgress(questionNumber, isCorrect, timeTaken) {
    const progress = userProgress[questionNumber];

    if (!progress.seen) {
        progress.seen = true;
    }

    if (isCorrect) {
        progress.correct++;
    } else {
        progress.incorrect++;
    }

    progress.attempts++;
    progress.totalTime += Math.min(timeTaken, 20000); // Cap at 20 seconds

    // Add to recent questions buffer
    recentQuestions.push(questionNumber);
    if (recentQuestions.length > RECENT_WINDOW_SIZE) {
        recentQuestions.shift();
    }

    saveUserProgress();
}

function getQuestionMasteryLevel(questionNumber) {
    const progress = userProgress[questionNumber];

    if (!progress.seen) return 'not-seen';

    const total = progress.correct + progress.incorrect;
    const accuracy = progress.correct / total;
    const avgTime = progress.totalTime / progress.attempts;

    // STRUGGLING: Getting it wrong more often than right
    // Primary factor: accuracy < 50%
    // Time is only considered if extremely slow (>15s suggests confusion)
    if (accuracy < 0.5) return 'struggling';
    if (avgTime > 15000 && accuracy < 0.7) return 'struggling';

    // MASTERED: Consistently getting it right
    // Primary factor: accuracy >= 85% with at least 3 attempts
    // Time is reasonable (< 12s) - user has time to read and think
    if (accuracy >= 0.85 && total >= 3 && avgTime <= 12000) return 'mastered';
    // Also mastered if perfect accuracy, regardless of time
    if (accuracy === 1.0 && total >= 2) return 'mastered';

    // LEARNING: Everything in between
    // User is improving but not consistently perfect yet
    return 'learning';
}

function getQuestionWeight(questionNumber) {
    const progress = userProgress[questionNumber];

    // Never seen: highest priority (weight 250)
    if (!progress.seen) return 250;

    const total = progress.correct + progress.incorrect;
    const accuracy = progress.correct / total;
    const avgTime = progress.totalTime / progress.attempts;

    // STRUGGLING: High priority - needs more practice
    // Weight 60-90 based on how poorly they're doing
    if (accuracy < 0.5) {
        return 60 + (1 - accuracy) * 30;
    }
    if (avgTime > 15000 && accuracy < 0.7) {
        return 55 + (1 - accuracy) * 20;
    }

    // MASTERED: Low priority - they know it well
    // Weight 1-5, decreases with more successful attempts
    if (accuracy >= 0.85 && total >= 3 && avgTime <= 12000) {
        return Math.max(1, 5 - total);
    }
    if (accuracy === 1.0 && total >= 2) {
        return Math.max(1, 5 - total);
    }

    // LEARNING: Medium priority - still improving
    // Weight 20-40 based on accuracy (prioritizes lower accuracy)
    return 20 + (1 - accuracy) * 20;
}

// Question Selection
function selectRandomQuestion() {
    // Build weighted array (exclude current question and recent questions)
    let weights = [];
    let questions = [];

    // Helper to build candidate list
    const buildCandidates = (excludeRecent) => {
        weights = [];
        questions = [];

        quizData.forEach(q => {
            if (currentQuestion && q.questionNumber === currentQuestion.questionNumber) {
                return; // Skip current question
            }

            if (excludeRecent && recentQuestions.includes(q.questionNumber)) {
                return; // Skip recent questions
            }

            const weight = getQuestionWeight(q.questionNumber);
            weights.push(weight);
            questions.push(q);
        });
    };

    // First try excluding recent questions
    buildCandidates(true);

    // Fallback: If no questions available (e.g., all are recent), try including recent ones
    if (questions.length === 0) {
        buildCandidates(false);
    }

    // Weighted random selection
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < weights.length; i++) {
        random -= weights[i];
        if (random <= 0) {
            return questions[i];
        }
    }

    return questions[questions.length - 1];
}

function selectSequentialQuestion() {
    if (currentQuestionIndex >= quizData.length) {
        currentQuestionIndex = 0;
    }
    return quizData[currentQuestionIndex];
}

function createTestSequence() {
    // Select 40 random questions
    const shuffled = [...quizData].sort(() => Math.random() - 0.5);
    questionSequence = shuffled.slice(0, 40);
    currentQuestionIndex = 0;
}

// Screen Navigation
function showScreen(screenId, addToHistory = true) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
    }

    // Show/hide install button based on current screen
    const installBtn = document.getElementById('install-btn');
    if (screenId === 'home-screen') {
        // Check for resume capability whenever showing home screen
        checkResumeAvailable();

        // Only show if PWA is installable and button exists
        if (installBtn && deferredPrompt) {
            installBtn.classList.remove('hidden');
        }
    } else {
        // Hide on quiz and stats screens
        if (installBtn) {
            installBtn.classList.add('hidden');
        }
    }

    // Add to browser history
    if (addToHistory) {
        history.pushState({ screen: screenId }, '', `#${screenId}`);
    }
}

function startQuiz(mode, resume = false) {
    currentMode = mode;
    questionsAnsweredCount = 0; // Reset counter when starting quiz

    // Reset history
    questionHistory = [];
    historyIndex = 0;
    liveQuestionState = null;
    currentQuestionState = null;

    if (resume && mode === 'sequential') {
        const savedIndex = localStorage.getItem('lastSequentialIndex');
        currentQuestionIndex = savedIndex ? parseInt(savedIndex) : 0;
    } else {
        currentQuestionIndex = 0;
    }

    if (mode === 'test') {
        createTestSequence();
        startTestTimer();
    }

    showScreen('quiz-screen');
    loadNextQuestion();
}

function exitQuiz() {
    if (testTimerInterval) {
        clearInterval(testTimerInterval);
        testTimerInterval = null;
    }
    showScreen('home-screen');
}

// Quiz Logic
function loadNextQuestion() {
    // Handle history navigation
    if (historyIndex < questionHistory.length) {
        historyIndex++;

        // If back to live state
        if (historyIndex === questionHistory.length) {
            if (liveQuestionState) {
                currentQuestion = liveQuestionState.question;
                questionStartTime = Date.now();
                displayQuestion(currentQuestion, liveQuestionState.state);
                liveQuestionState = null;
                updateQuizHeader();
                return;
            }
        } else {
            // Load history item
            const historyItem = questionHistory[historyIndex];
            currentQuestion = historyItem.question;
            displayQuestion(currentQuestion, historyItem.state);
            updateQuizHeader();
            return;
        }
    }

    // Push current completed question to history
    if (currentQuestion && currentQuestionState) {
        questionHistory.push({
            question: currentQuestion,
            state: currentQuestionState
        });
        historyIndex++;
    }

    // Reset state for new question
    currentQuestionState = null;

    let question;

    if (currentMode === 'random') {
        question = selectRandomQuestion();
    } else if (currentMode === 'sequential') {
        question = selectSequentialQuestion();
        localStorage.setItem('lastSequentialIndex', currentQuestionIndex);
        currentQuestionIndex++;
    } else if (currentMode === 'test') {
        if (currentQuestionIndex >= questionSequence.length) {
            finishTest();
            return;
        }
        question = questionSequence[currentQuestionIndex];
        currentQuestionIndex++;
    }

    currentQuestion = question;
    questionStartTime = Date.now();

    displayQuestion(question);
    updateQuizHeader();
}

function goToPreviousQuestion() {
    if (historyIndex > 0) {
        // If we are at the end (live), save current state
        if (historyIndex === questionHistory.length) {
            liveQuestionState = {
                question: currentQuestion,
                state: currentQuestionState
            };
        }

        historyIndex--;
        const historyItem = questionHistory[historyIndex];
        currentQuestion = historyItem.question;

        // Restore state
        // If result was incorrect/skipped, pass null to reset UI so user can try again
        const stateToRestore = (historyItem.state.result === 'correct') ? historyItem.state : null;

        displayQuestion(currentQuestion, stateToRestore);
        updateQuizHeader();
    }
}

function displayQuestion(question, restoredState = null) {
    // Question text - hide if empty
    const questionText = document.getElementById('question-text');
    if (question.question && question.question.trim()) {
        questionText.textContent = question.question;
        questionText.style.display = 'block';
    } else {
        questionText.textContent = '';
        questionText.style.display = 'none';
    }

    // Question image
    const questionImage = document.getElementById('question-image');
    questionImage.innerHTML = '';
    if (question.images && question.images.length > 0) {
        const img = document.createElement('img');
        img.src = question.images[0];
        img.alt = 'Question image';
        questionImage.appendChild(img);
        questionImage.style.display = 'block';
    } else {
        questionImage.style.display = 'none';
    }

    // Choices
    const choicesContainer = document.getElementById('choices-container');
    choicesContainer.innerHTML = '';

    // Create a shuffled copy of choices
    const shuffledChoices = [...question.choices];
    for (let i = shuffledChoices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledChoices[i], shuffledChoices[j]] = [shuffledChoices[j], shuffledChoices[i]];
    }

    shuffledChoices.forEach((choice) => {
        const button = document.createElement('button');
        button.className = 'choice-btn';
        button.textContent = choice.text;
        if (choice.is_correct) {
            button.dataset.correct = 'true';
        }
        button.onclick = () => selectAnswer(choice, button);

        // Restore selection/state if provided
        if (restoredState && restoredState.selectedChoiceIndex === index) {
            button.classList.add('selected');
            if (restoredState.result === 'correct') {
                button.classList.add('correct');
            } else if (restoredState.result === 'incorrect') {
                button.classList.add('incorrect');
            }
        }

        if (restoredState && restoredState.result === 'correct') {
            button.disabled = true;
            if (choice.is_correct) {
                button.classList.add('correct');
            }
        }

        choicesContainer.appendChild(button);
    });

    // Handle feedback and buttons based on restored state
    const feedback = document.getElementById('feedback');
    const skipBtn = document.getElementById('skip-btn');

    if (restoredState && restoredState.result === 'correct') {
        feedback.classList.remove('hidden');
        feedback.classList.add('correct');
        feedback.classList.remove('incorrect');
        document.getElementById('feedback-text').textContent = '✓ Correct!';
        document.getElementById('next-btn').classList.remove('hidden'); // Show next button to allow moving forward
        skipBtn.classList.add('hidden');
    } else {
        // Reset feedback for fresh or incorrect state (allowing retry)
        feedback.classList.add('hidden');
        feedback.classList.remove('correct', 'incorrect');
        skipBtn.classList.remove('hidden');
    }
}

function selectAnswer(selectedChoice, selectedButton) {
    const timeTaken = Date.now() - questionStartTime;
    const isCorrect = selectedChoice.is_correct;

    // Track state
    const choiceIndex = currentQuestion.choices.indexOf(selectedChoice);
    currentQuestionState = {
        result: isCorrect ? 'correct' : 'incorrect',
        selectedChoiceIndex: choiceIndex
    };

    // Update history if we are revisiting a question
    if (historyIndex < questionHistory.length) {
        questionHistory[historyIndex].state = currentQuestionState;
    }

    // Disable all choice buttons
    const allButtons = document.querySelectorAll('.choice-btn');
    allButtons.forEach(btn => {
        btn.disabled = true;
    });

    // Hide skip button once an answer is selected
    const skipBtn = document.getElementById('skip-btn');
    skipBtn.classList.add('hidden');

    // Highlight selected answer
    selectedButton.classList.add('selected');

    // Show correct/incorrect styling
    if (isCorrect) {
        selectedButton.classList.add('correct');
        showFeedback(true);

        // Increment answered count for random and sequential modes
        if (currentMode === 'random' || currentMode === 'sequential') {
            questionsAnsweredCount++;
        }

        // Auto-advance after 1 second
        setTimeout(() => {
            updateQuestionProgress(currentQuestion.questionNumber, true, timeTaken);
            loadNextQuestion();
        }, 1000);
    } else {
        selectedButton.classList.add('incorrect');

        // Highlight correct answer
        allButtons.forEach((btn) => {
            if (btn.dataset.correct === 'true') {
                btn.classList.add('correct');
            }
        });

        // Increment answered count for random and sequential modes
        if (currentMode === 'random' || currentMode === 'sequential') {
            questionsAnsweredCount++;
        }

        showFeedback(false);
        updateQuestionProgress(currentQuestion.questionNumber, false, timeTaken);
    }
}

function skipQuestion() {
    // Track state
    currentQuestionState = {
        result: 'skipped',
        selectedChoiceIndex: null
    };

    // Update history if we are revisiting a question
    if (historyIndex < questionHistory.length) {
        questionHistory[historyIndex].state = currentQuestionState;
    }

    // Hide skip button
    const skipBtn = document.getElementById('skip-btn');
    skipBtn.classList.add('hidden');

    // Calculate time taken
    const timeTaken = Date.now() - questionStartTime;

    // Increment answered count for random and sequential modes
    if (currentMode === 'random' || currentMode === 'sequential') {
        questionsAnsweredCount++;
    }

    // Mark question as incorrect/failed when skipped
    updateQuestionProgress(currentQuestion.questionNumber, false, timeTaken);

    // Move to next question
    loadNextQuestion();
}

function showFeedback(isCorrect) {
    const feedback = document.getElementById('feedback');
    const feedbackText = document.getElementById('feedback-text');
    const nextBtn = document.getElementById('next-btn');

    feedback.classList.remove('hidden');

    if (isCorrect) {
        feedback.classList.add('correct');
        feedbackText.textContent = '✓ Correct!';
        nextBtn.classList.add('hidden');
    } else {
        feedback.classList.add('incorrect');
        feedbackText.textContent = '✗ Incorrect';
        nextBtn.classList.remove('hidden');
    }
}

function updateQuizHeader() {
    const counter = document.getElementById('question-counter');

    // Update Previous button visibility
    const prevBtn = document.getElementById('prev-btn');
    if (historyIndex > 0) {
        prevBtn.classList.remove('hidden');
    } else {
        prevBtn.classList.add('hidden');
    }

    if (currentMode === 'test') {
        counter.textContent = `Question ${currentQuestionIndex}/${questionSequence.length}`;
        counter.classList.remove('interactive');
    } else if (currentMode === 'sequential') {
        counter.textContent = `Question ${currentQuestion.questionNumber}/${quizData.length} • Answered: ${questionsAnsweredCount}`;
        counter.classList.add('interactive');
    } else if (currentMode === 'random') {
        counter.textContent = `Question ${currentQuestion.questionNumber} • Answered: ${questionsAnsweredCount}`;
        counter.classList.remove('interactive');
    } else {
        counter.textContent = `Question ${currentQuestion.questionNumber}`;
        counter.classList.remove('interactive');
    }
}

// Test Timer
function startTestTimer() {
    testStartTime = Date.now();
    const timerElement = document.getElementById('timer');
    timerElement.style.display = 'block';

    testTimerInterval = setInterval(() => {
        const elapsed = Date.now() - testStartTime;
        const remaining = Math.max(0, 40 * 60 * 1000 - elapsed);

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Remove all timer classes
        timerElement.classList.remove('timer-warning', 'timer-critical');

        // Add warning class for last 3 minutes
        if (remaining <= 3 * 60 * 1000 && remaining > 30 * 1000) {
            timerElement.classList.add('timer-warning');
        }

        // Add critical class for last 30 seconds (includes pulse animation)
        if (remaining <= 30 * 1000) {
            timerElement.classList.add('timer-critical');
        }

        if (remaining === 0) {
            finishTest();
        }
    }, 1000);
}

function finishTest() {
    clearInterval(testTimerInterval);
    testTimerInterval = null;
    alert('Test completed!');
    exitQuiz();
}

// Stats Screen
function showStats() {
    updateStatsSummary();
    renderQuestionsGrid();
    showScreen('stats-screen');
}

function updateStatsSummary() {
    let totalSeen = 0;
    let totalCorrect = 0;
    let totalAttempts = 0;

    Object.values(userProgress).forEach(progress => {
        if (progress.seen) {
            totalSeen++;
            totalCorrect += progress.correct;
            totalAttempts += progress.attempts;
        }
    });

    const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

    document.getElementById('total-seen').textContent = totalSeen;
    document.getElementById('total-correct').textContent = totalCorrect;
    document.getElementById('accuracy').textContent = `${accuracy}%`;
}

function renderQuestionsGrid() {
    const grid = document.getElementById('questions-grid');
    grid.innerHTML = '';

    quizData.forEach(question => {
        const cell = document.createElement('div');
        cell.className = `question-cell ${getQuestionMasteryLevel(question.questionNumber)}`;
        cell.textContent = question.questionNumber;
        cell.dataset.questionNumber = question.questionNumber;

        // Click event to show modal
        cell.addEventListener('click', () => showQuestionModal(question));

        grid.appendChild(cell);
    });
}

function showQuestionModal(question) {
    const modal = document.getElementById('question-modal');
    const progress = userProgress[question.questionNumber];

    // Title
    document.getElementById('modal-title').textContent = `Question ${question.questionNumber}`;

    // Image
    const modalImage = document.getElementById('modal-image');
    modalImage.innerHTML = '';
    if (question.images && question.images.length > 0) {
        const img = document.createElement('img');
        img.src = question.images[0];
        img.alt = 'Question image';
        modalImage.appendChild(img);
        modalImage.style.display = 'block';
    } else {
        modalImage.style.display = 'none';
    }

    // Question text
    const modalQuestion = document.getElementById('modal-question');
    if (question.question && question.question.trim()) {
        modalQuestion.textContent = question.question;
        modalQuestion.style.display = 'block';
    } else {
        modalQuestion.textContent = '';
        modalQuestion.style.display = 'none';
    }

    // Choices
    const modalChoices = document.getElementById('modal-choices');
    modalChoices.innerHTML = '';
    question.choices.forEach(choice => {
        const className = choice.is_correct ? 'modal-choice correct' : 'modal-choice';
        const div = document.createElement('div');
        div.className = className;
        div.textContent = choice.text;
        modalChoices.appendChild(div);
    });

    // Stats
    const modalStats = document.getElementById('modal-stats');
    if (progress.seen) {
        const total = progress.correct + progress.incorrect;
        const accuracy = total > 0 ? Math.round((progress.correct / total) * 100) : 0;
        const avgTime = progress.totalTime / progress.attempts / 1000;

        modalStats.innerHTML = `
            <div class="modal-stats-row">
                <span class="modal-stats-label">Status:</span>
                <span class="modal-stats-value">${getMasteryLabel(getQuestionMasteryLevel(question.questionNumber))}</span>
            </div>
            <div class="modal-stats-row">
                <span class="modal-stats-label">Attempts:</span>
                <span class="modal-stats-value">${progress.attempts}</span>
            </div>
            <div class="modal-stats-row">
                <span class="modal-stats-label">Correct:</span>
                <span class="modal-stats-value">${progress.correct} / ${total} (${accuracy}%)</span>
            </div>
            <div class="modal-stats-row">
                <span class="modal-stats-label">Avg Time:</span>
                <span class="modal-stats-value">${avgTime.toFixed(1)}s</span>
            </div>
        `;
        modalStats.style.display = 'block';
    } else {
        modalStats.innerHTML = `
            <div class="modal-stats-row">
                <span class="modal-stats-label">Status:</span>
                <span class="modal-stats-value">Not seen yet</span>
            </div>
        `;
        modalStats.style.display = 'block';
    }

    // Show modal with animation
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('visible'), 10);
}

function hideQuestionModal() {
    const modal = document.getElementById('question-modal');
    modal.classList.remove('visible');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function getMasteryLabel(level) {
    const labels = {
        'not-seen': 'Not Seen',
        'struggling': 'Struggling',
        'learning': 'Learning',
        'mastered': 'Mastered'
    };
    return labels[level] || level;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await loadQuizData();

    // Initialize history state
    history.replaceState({ screen: 'home-screen' }, '', '#home-screen');

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/test-drive-peru-A1/service-worker.js', {
                scope: '/test-drive-peru-A1/'
            });
            console.log('Service Worker registered successfully:', registration.scope);
            
            // Check for updates every time the app loads
            registration.update();
            
            // Listen for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('New service worker found!');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'activated') {
                        console.log('New service worker activated!');
                        // Reload the page to use the new service worker
                        window.location.reload();
                    }
                });
            });
        } catch (error) {
            console.log('Service Worker registration failed:', error);
        }
    }

    // Handle service worker controller change (when new SW takes over)
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
        console.log('Service Worker controller changed, reloading...');
        window.location.reload();
    });

    // PWA Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install button
        const installBtn = document.getElementById('install-btn');
        installBtn.classList.remove('hidden');
    });

    // Install button click handler
    document.getElementById('install-btn').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        console.log(`User response to install prompt: ${outcome}`);
        deferredPrompt = null;
        
        // Hide install button
        document.getElementById('install-btn').classList.add('hidden');
    });

    // Hide install button when app is installed
    window.addEventListener('appinstalled', () => {
        console.log('PWA installed successfully');
        document.getElementById('install-btn').classList.add('hidden');
        deferredPrompt = null;
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Menu buttons
    document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === 'resume') {
                startQuiz('sequential', true);
            } else {
                startQuiz(mode);
            }
        });
    });

    // Stats button
    document.getElementById('stats-btn').addEventListener('click', showStats);

    // Exit buttons
    document.getElementById('exit-quiz').addEventListener('click', exitQuiz);
    document.getElementById('exit-stats').addEventListener('click', () => {
        showScreen('home-screen');
    });

    // Previous button
    document.getElementById('prev-btn').addEventListener('click', goToPreviousQuestion);

    // Next button
    document.getElementById('next-btn').addEventListener('click', loadNextQuestion);

    // Skip button
    document.getElementById('skip-btn').addEventListener('click', skipQuestion);

    // Modal close handlers
    document.getElementById('modal-close').addEventListener('click', hideQuestionModal);
    document.getElementById('question-modal').addEventListener('click', (e) => {
        if (e.target.id === 'question-modal') {
            hideQuestionModal();
        }
    });

    // Hide timer by default
    document.getElementById('timer').style.display = 'none';

    // Jump to question handler
    document.getElementById('question-counter').addEventListener('click', () => {
        if (currentMode === 'sequential') {
            // Prevent if already an input
            if (document.getElementById('jump-input')) return;
            enableJumpToQuestion();
        }
    });
});

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.screen) {
        // Navigate to the screen without adding to history again
        showScreen(event.state.screen, false);
        
        // If going back from quiz, clean up timer
        if (event.state.screen !== 'quiz-screen' && testTimerInterval) {
            clearInterval(testTimerInterval);
            testTimerInterval = null;
        }
    } else {
        // Default to home screen if no state
        showScreen('home-screen', false);
    }
});

function checkResumeAvailable() {
    const savedIndex = localStorage.getItem('lastSequentialIndex');
    const resumeBtn = document.getElementById('resume-btn');
    if (savedIndex && parseInt(savedIndex) > 0 && resumeBtn) {
        resumeBtn.classList.remove('hidden');
    }
}

function enableJumpToQuestion() {
    const counter = document.getElementById('question-counter');
    const currentNum = currentQuestion.questionNumber;

    counter.innerHTML = `Question <input type="number" id="jump-input" value="${currentNum}" min="1" max="${quizData.length}"> / ${quizData.length}`;

    const input = document.getElementById('jump-input');
    input.focus();
    input.select();

    // Stop propagation of click to avoid immediately triggering outside clicks if any
    input.addEventListener('click', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseInt(input.value);
            if (val >= 1 && val <= quizData.length) {
                jumpToQuestion(val);
            } else {
                updateQuizHeader(); // Revert
            }
        } else if (e.key === 'Escape') {
            updateQuizHeader(); // Revert
        }
    });

    input.addEventListener('blur', () => {
        // Small delay to allow enter key or other events to process
        setTimeout(() => {
             // Only revert if we haven't just navigated (which would have refreshed the header already)
             if (document.getElementById('jump-input')) {
                 updateQuizHeader();
             }
        }, 100);
    });
}

function jumpToQuestion(number) {
    const index = number - 1;

    if (index >= 0 && index < quizData.length) {
        currentQuestionIndex = index;
        loadNextQuestion();
    }
}
