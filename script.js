// Wait for the DOM to be fully loaded before running our script
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    // Views
    const categoryView = document.getElementById('category-view');
    const chatView = document.getElementById('chat-view');

    // Category Buttons
    const categoryButtons = document.querySelectorAll('.category-button');
    
    // Chat Elements
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const loadingSpinner = document.getElementById('loading-spinner');
    const backButton = document.getElementById('back-button');
    const headerSubtitle = document.getElementById('header-subtitle');

    // --- State ---
    let currentCategory = null; // e.g., 'food', 'sights'
    let currentCategoryTitle = null; // e.g., 'Φαγητό', 'Αξιοθέατα/Διαδρομές'

    // --- API Config ---
    const apiKey = ""; // Leave as-is, will be handled by the environment
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    // Base System prompt
    const BASE_SYSTEM_PROMPT = "You are a friendly, warm, and expert local concierge for 'Casa Nustra', a beautiful guest house in Pramanta, Boreion Tzoumerkon, Greece. Your sole purpose is to provide helpful, specific, and inspiring recommendations to guests. ALWAYS focus your answers on the local area of Pramanta, the broader Tzoumerka region, Arta, and the Epirus region. Be welcoming and encourage guests to enjoy their stay. If you find sources, cite them to help the guest.";

    // --- Functions ---

    /**
     * Shows the main category selection view
     */
    function showCategoryView() {
        chatView.classList.add('hidden');
        categoryView.classList.remove('hidden');
        currentCategory = null;
        currentCategoryTitle = null;
        chatMessages.innerHTML = ''; // Clear chat history
        headerSubtitle.textContent = "Your guide to Pramanta & Tzoumerka"; // Reset subtitle
    }

    /**
     * Shows the chat view for a specific category
     * @param {string} categoryKey - The category key (e.g., 'food')
     * @param {string} categoryTitle - The display title (e.g., 'Φαγητό')
     */
    function showChatView(categoryKey, categoryTitle) {
        currentCategory = categoryKey;
        currentCategoryTitle = categoryTitle;
        
        categoryView.classList.add('hidden');
        chatView.classList.remove('hidden');
        
        chatMessages.innerHTML = ''; // Clear previous messages
        headerSubtitle.textContent = `Topic: ${categoryTitle}`; // Set subtitle
        messageInput.placeholder = `Ask about ${categoryTitle}...`; // Update placeholder

        // Add a specific welcome message
        let welcomeMsg = `You've selected '${categoryTitle}'. How can I help you find the best ${categoryKey} in the Pramanta area?`;
        addMessage(welcomeMsg, 'assistant');
    }

    /**
     * Adds a message to the chat interface.
     * @param {string} message - The text content of the message.
     * @param {'user' | 'assistant'} sender - The sender of the message.
     * @param {Array<Object>} sources - Array of source objects from grounding.
     */
    function addMessage(message, sender, sources = []) {
        // ... (This function is unchanged from the previous version) ...
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
        
        const messageBubble = document.createElement('div');
        messageBubble.className = `rounded-2xl p-4 max-w-xs lg:max-w-md shadow-sm ${
            sender === 'user' 
            ? 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100 rounded-br-none' 
            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'
        }`;

        let formattedMessage = message
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n- (.*)/g, '<ul class="list-disc list-inside ml-4"><li>$1</li></ul>')
            .replace(/<\/ul>\n<ul class="list-disc list-inside ml-4">/g, '');

        messageBubble.innerHTML = formattedMessage;

        if (sources.length > 0) {
            const sourcesContainer = document.createElement('div');
            sourcesContainer.className = 'mt-3 pt-3 border-t border-gray-300 dark:border-gray-600';
            
            const sourcesTitle = document.createElement('h4');
            sourcesTitle.className = 'text-xs font-semibold mb-1 opacity-80';
            sourcesTitle.textContent = 'For more info:';
            sourcesContainer.appendChild(sourcesTitle);

            const sourcesList = document.createElement('ul');
            sourcesList.className = 'list-none space-y-1';
            
            sources.forEach((source, index) => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = source.uri;
                a.textContent = `${index + 1}. ${source.title}`;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.className = 'text-xs text-green-700 dark:text-green-400 hover:underline truncate block';
                li.appendChild(a);
                sourcesList.appendChild(li);
            });
            sourcesContainer.appendChild(sourcesList);
            messageBubble.appendChild(sourcesContainer);
        }

        messageWrapper.appendChild(messageBubble);
        chatMessages.appendChild(messageWrapper);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Fetches a response from the Gemini API with exponential backoff.
     * @param {string} url - The API endpoint.
     * @param {object} options - The fetch options (method, headers, body).
     * @param {number} retries - The number of retries left.
     * @param {number} delay - The delay in ms before retrying.
     * @returns {Promise<object>} - The JSON response from the API.
     */
    async function fetchWithBackoff(url, options, retries = 3, delay = 1000) {
        // ... (This function is unchanged from the previous version) ...
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                if (response.status === 429 && retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithBackoff(url, options, retries - 1, delay * 2);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithBackoff(url, options, retries - 1, delay * 2);
            }
            console.error("Fetch error after retries:", error);
            throw error;
        }
    }

    /**
     * Gets a response from the Gemini API, now aware of the category.
     * @param {string} query - The user's query.
     */
    async function getBotResponse(query) {
        loadingSpinner.classList.remove('hidden');

        // Add location context
        const userQueryWithContext = `${query} (recommendations near Pramanta, Tzoumerka, Greece)`;
        
        // --- Create a specific system prompt based on the category ---
        let specificSystemPrompt = BASE_SYSTEM_PROMPT;
        if (currentCategory) {
            specificSystemPrompt += `\n\n**IMPORTANT**: The user has pre-selected the category "${currentCategoryTitle}" (${currentCategory}). You MUST focus your entire response on this specific topic. For example, if the category is 'food', only talk about food. If it's 'sights', only talk about sights and routes.`;
        }
        // This is where we will later add logic to use your CSV data.
        // For now, this prompt guides the RAG search.
        
        const payload = {
            contents: [{
                parts: [{ text: userQueryWithContext }]
            }],
            tools: [{
                "google_search": {}
            }],
            systemInstruction: {
                parts: [{ text: specificSystemPrompt }]
            },
        };

        try {
            const result = await fetchWithBackoff(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const candidate = result.candidates?.[0];
            let text = "I'm sorry, I couldn't find an answer for that. Could you ask in a different way?";
            let sources = [];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                text = candidate.content.parts[0].text;

                const groundingMetadata = candidate.groundingMetadata;
                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    sources = groundingMetadata.groundingAttributions
                        .map(attribution => ({
                            uri: attribution.web?.uri,
                            title: attribution.web?.title,
                        }))
                        .filter(source => source.uri && source.title);
                }
            }
            
            addMessage(text, 'assistant', sources);

        } catch (error) {
            console.error('Error fetching bot response:', error);
            addMessage("I'm having some technical difficulties right now. Please try again in a moment.", 'assistant');
        } finally {
            loadingSpinner.classList.add('hidden');
        }
    }

    /**
     * Handles sending a message (from button click or Enter key).
     */
    function sendMessage() {
        const query = messageInput.value.trim();
        if (query === "") return;

        addMessage(query, 'user');
        messageInput.value = "";
        
        getBotResponse(query);
    }

    // --- Event Listeners ---

    // Listen for clicks on all category buttons
    categoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            const categoryKey = button.dataset.category;
            const categoryTitle = button.dataset.title;
            showChatView(categoryKey, categoryTitle);
        });
    });

    // Listen for click on the Back button
    backButton.addEventListener('click', showCategoryView);

    // Listen for send button click
    sendButton.addEventListener('click', sendMessage);

    // Listen for Enter key in input
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // --- Initial State ---
    // Show the category view by default
    showCategoryView();

});