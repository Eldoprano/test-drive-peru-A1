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
}

function saveUserProgress() {
    localStorage.setItem('userProgress', JSON.stringify(userProgress));
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
    progress.totalTime += Math.min(timeTaken, 10000); // Cap at 10 seconds

    saveUserProgress();
}

function getQuestionMasteryLevel(questionNumber) {
    const progress = userProgress[questionNumber];

    if (!progress.seen) return 'not-seen';

    const total = progress.correct + progress.incorrect;
    const accuracy = progress.correct / total;
    const avgTime = progress.totalTime / progress.attempts;

    // Struggling: accuracy < 50% or avg time > 7s
    if (accuracy < 0.5 || avgTime > 7000) return 'struggling';

    // Mastered: accuracy >= 80% and avg time <= 5s and at least 3 attempts
    if (accuracy >= 0.8 && avgTime <= 5000 && total >= 3) return 'mastered';

    // Learning: everything else
    return 'learning';
}

function getQuestionWeight(questionNumber) {
    const progress = userProgress[questionNumber];

    // Never seen: highest priority (weight 100)
    if (!progress.seen) return 100;

    const total = progress.correct + progress.incorrect;
    const accuracy = progress.correct / total;
    const avgTime = progress.totalTime / progress.attempts;

    // Struggling: high priority (weight 50-80)
    if (accuracy < 0.5 || avgTime > 7000) {
        return 50 + (1 - accuracy) * 30;
    }

    // Mastered: low priority (weight 1-10)
    if (accuracy >= 0.8 && avgTime <= 5000) {
        return Math.max(1, 10 - total);
    }

    // Learning: medium priority (weight 20-40)
    return 20 + (1 - accuracy) * 20;
}

// Question Selection
function selectRandomQuestion() {
    // Build weighted array (exclude current question)
    const weights = [];
    const questions = [];

    quizData.forEach(q => {
        if (currentQuestion && q.questionNumber === currentQuestion.questionNumber) {
            return; // Skip current question
        }

        const weight = getQuestionWeight(q.questionNumber);
        weights.push(weight);
        questions.push(q);
    });

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
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
    }
}

function startQuiz(mode) {
    currentMode = mode;
    currentQuestionIndex = 0;

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
    let question;

    if (currentMode === 'random') {
        question = selectRandomQuestion();
    } else if (currentMode === 'sequential') {
        question = selectSequentialQuestion();
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

function displayQuestion(question) {
    // Question text
    const questionText = document.getElementById('question-text');
    questionText.textContent = question.question || 'Select the correct answer:';

    // Question image
    const questionImage = document.getElementById('question-image');
    if (question.images && question.images.length > 0) {
        questionImage.innerHTML = `<img src="${question.images[0]}" alt="Question image">`;
        questionImage.style.display = 'block';
    } else {
        questionImage.innerHTML = '';
        questionImage.style.display = 'none';
    }

    // Choices
    const choicesContainer = document.getElementById('choices-container');
    choicesContainer.innerHTML = '';

    question.choices.forEach((choice, index) => {
        const button = document.createElement('button');
        button.className = 'choice-btn';
        button.textContent = choice.text;
        button.onclick = () => selectAnswer(choice, button);
        choicesContainer.appendChild(button);
    });

    // Reset feedback
    const feedback = document.getElementById('feedback');
    feedback.classList.add('hidden');
    feedback.classList.remove('correct', 'incorrect');
}

function selectAnswer(selectedChoice, selectedButton) {
    const timeTaken = Date.now() - questionStartTime;
    const isCorrect = selectedChoice.is_correct;

    // Disable all choice buttons
    const allButtons = document.querySelectorAll('.choice-btn');
    allButtons.forEach(btn => {
        btn.disabled = true;
    });

    // Highlight selected answer
    selectedButton.classList.add('selected');

    // Show correct/incorrect styling
    if (isCorrect) {
        selectedButton.classList.add('correct');
        showFeedback(true);

        // Auto-advance after 1 second
        setTimeout(() => {
            updateQuestionProgress(currentQuestion.questionNumber, true, timeTaken);
            loadNextQuestion();
        }, 1000);
    } else {
        selectedButton.classList.add('incorrect');

        // Highlight correct answer
        allButtons.forEach((btn, index) => {
            if (currentQuestion.choices[index].is_correct) {
                btn.classList.add('correct');
            }
        });

        showFeedback(false);
        updateQuestionProgress(currentQuestion.questionNumber, false, timeTaken);
    }
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

    if (currentMode === 'test') {
        counter.textContent = `Question ${currentQuestionIndex}/${questionSequence.length}`;
    } else if (currentMode === 'sequential') {
        counter.textContent = `Question ${currentQuestion.questionNumber}/${quizData.length}`;
    } else {
        counter.textContent = `Question ${currentQuestion.questionNumber}`;
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

        // Hover events for tooltip
        cell.addEventListener('mouseenter', (e) => showTooltip(e, question));
        cell.addEventListener('mousemove', (e) => updateTooltipPosition(e));
        cell.addEventListener('mouseleave', hideTooltip);

        grid.appendChild(cell);
    });
}

function showTooltip(event, question) {
    const tooltip = document.getElementById('question-tooltip');
    const progress = userProgress[question.questionNumber];

    // Title
    document.getElementById('tooltip-title').textContent =
        `Question ${question.questionNumber}`;

    // Image
    const tooltipImage = document.getElementById('tooltip-image');
    if (question.images && question.images.length > 0) {
        tooltipImage.innerHTML = `<img src="${question.images[0]}" alt="Question image" style="max-width: 200px;">`;
    } else {
        tooltipImage.innerHTML = '';
    }

    // Question text
    const tooltipChoices = document.getElementById('tooltip-choices');
    let choicesHtml = '';

    if (question.question) {
        choicesHtml += `<div style="margin-bottom: 0.5rem; font-weight: 600;">${question.question}</div>`;
    }

    question.choices.forEach(choice => {
        choicesHtml += `<div>${choice.text}</div>`;
    });
    tooltipChoices.innerHTML = choicesHtml;

    // Answer
    const correctChoice = question.choices.find(c => c.is_correct);
    const tooltipAnswer = document.getElementById('tooltip-answer');
    tooltipAnswer.textContent = `✓ ${correctChoice.text}`;

    // Stats
    if (progress.seen) {
        tooltipAnswer.textContent += ` (${progress.correct}/${progress.attempts})`;
    }

    tooltip.classList.remove('hidden');
    updateTooltipPosition(event);
}

function updateTooltipPosition(event) {
    const tooltip = document.getElementById('question-tooltip');
    const x = event.clientX;
    const y = event.clientY;

    // Position tooltip near cursor
    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;

    // Adjust if tooltip goes off screen
    const rect = tooltip.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        tooltip.style.left = `${x - rect.width - 15}px`;
    }
    if (rect.bottom > window.innerHeight) {
        tooltip.style.top = `${y - rect.height - 15}px`;
    }
}

function hideTooltip() {
    const tooltip = document.getElementById('question-tooltip');
    tooltip.classList.add('hidden');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await loadQuizData();

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Menu buttons
    document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            startQuiz(mode);
        });
    });

    // Stats button
    document.getElementById('stats-btn').addEventListener('click', showStats);

    // Exit buttons
    document.getElementById('exit-quiz').addEventListener('click', exitQuiz);
    document.getElementById('exit-stats').addEventListener('click', () => {
        showScreen('home-screen');
    });

    // Next button
    document.getElementById('next-btn').addEventListener('click', loadNextQuestion);

    // Hide timer by default
    document.getElementById('timer').style.display = 'none';
});
