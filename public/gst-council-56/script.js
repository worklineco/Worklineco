// GST Website Interactive Functionality

document.addEventListener('DOMContentLoaded', function() {
    // Navigation functionality
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Create a mapping of navigation items to content sections
    const tabMapping = {
        'Overview': 'overview-content',
        'Compensation Cess': 'compensation-cess-content',
        'Intermediaries': 'intermediaries-content',
        'Refunds': 'refunds-content',
        'Rate Rationalisation': 'rate-rationalisation-content',
        'Registration': 'registration-content',
        'Supply & Discounts': 'supply-discounts-content',
        'GSTAT': 'gstat-content',
        'Anti Profiteering': 'anti-profiteering-content',
        'Challenges': 'challenges-content',
        'Time of Supply': 'time-of-supply-content',
        'FAQs': 'faqs-content'
    };
    
    // Search functionality variables
    const searchBar = document.querySelector('.search-bar');
    let isSearchActive = false;
    let currentSearchTerm = '';
    let currentResultIndex = 0;
    let currentHighlightIndex = 0;
    let searchResultTabs = [];
    
    // Navigation functionality
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            // Clear search when navigating
            if (searchBar) {
                searchBar.value = '';
                isSearchActive = false;
                currentSearchTerm = '';
                clearSearchHighlights();
                hideSearchMessage();
                
                // Remove search result class from all sections
                const searchResults = document.querySelectorAll('.search-result');
                searchResults.forEach(section => {
                    section.classList.remove('search-result');
                });
            }
            
            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked item
            this.classList.add('active');
            
            // Hide all tab contents
            tabContents.forEach(content => {
                content.classList.remove('active');
                content.style.display = 'none';
            });
            
            // Show the corresponding content
            const tabName = this.textContent.trim();
            const contentId = tabMapping[tabName];
            
            if (contentId) {
                const targetContent = document.getElementById(contentId);
                if (targetContent) {
                    targetContent.classList.add('active');
                    targetContent.style.display = 'block';
                }
            }
            
            console.log('Selected tab:', tabName);
        });
    });
    
    // Sub-tab functionality for Rate Rationalisation
    const subNavItems = document.querySelectorAll('.sub-nav-item');
    const subTabContents = document.querySelectorAll('.sub-tab-content');
    
    subNavItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all sub-nav items
            subNavItems.forEach(subNav => subNav.classList.remove('active'));
            
            // Add active class to clicked sub-nav item
            this.classList.add('active');
            
            // Hide all sub-tab contents
            subTabContents.forEach(content => {
                content.classList.remove('active');
            });
            
            // Show the corresponding sub-tab content
            const subTabId = this.getAttribute('data-subtab');
            const targetContent = document.getElementById(subTabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            console.log('Selected sub-tab:', this.textContent);
        });
    });
    
    // Search functionality
    if (searchBar) {
        // Add search suggestions
        const searchSuggestions = [
            'Food', 'Agriculture', 'Textile', 'Health', 'Pharmaceuticals',
            'Motor Vehicles', 'Energy', 'Construction', 'Transportation',
            'GST rates', 'HSN codes', 'Refunds', 'Registration', 'GSTAT',
            'Compensation Cess', 'Intermediaries', 'Anti Profiteering',
            '5%', '12%', '18%', '28%', 'Nil', 'Exempt',
            'Milk', 'Bread', 'Medicines', 'Textiles', 'Machinery',
            'Meat', 'Dairy', 'Beverages', 'Snacks', 'Preserved',
            'Dry Fruits', 'Carbohydrates', 'Fats', 'Sugar', 'Cocoa',
            'Pasta', 'Corn Flakes', 'Bakery', 'Coffee', 'Tea', 'Soups',
            'Spectacles', 'Medical Equipment', 'Diagnostic Kits', 'Surgical Gloves',
            'Blood Glucose', 'Thermometers', 'X-ray', 'Contact Lenses',
            'Cigarettes', 'Tobacco', 'Pan Masala', 'Beedi', 'Luxury Cars',
            'Aerated Drinks', 'Carbonated Beverages', 'Coal', 'Lignite',
            'Solar', 'Renewable Energy', 'Biodiesel', 'Nuclear', 'Plastic',
            'Paper', 'Wood', 'Bamboo', 'Cork', 'Rubber', 'Leather',
            'Defence', 'Aircraft', 'Missiles', 'Drones', 'Military',
            'Cement', 'Sand', 'Bricks', 'Construction Materials',
            'Transport', 'Logistics', 'Job Work', 'Hospitality', 'Wellness',
            'Insurance', 'Life Insurance', 'Health Insurance', 'Cinema',
            'Toys', 'Handicrafts', 'Jewellery', 'Kitchenware', 'Furniture'
        ];
        
        // Create suggestions dropdown
        const suggestionsDropdown = document.createElement('div');
        suggestionsDropdown.className = 'search-suggestions';
        suggestionsDropdown.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #ddd;
            border-top: none;
            border-radius: 0 0 5px 5px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        
        // Position search bar relatively for dropdown
        searchBar.parentElement.style.position = 'relative';
        searchBar.parentElement.appendChild(suggestionsDropdown);
        
        // Show suggestions
        function showSuggestions(query) {
            if (query.length < 2) {
                suggestionsDropdown.style.display = 'none';
                return;
            }
            
            const filtered = searchSuggestions.filter(suggestion => 
                suggestion.toLowerCase().includes(query.toLowerCase())
            );
            
            if (filtered.length === 0) {
                suggestionsDropdown.style.display = 'none';
                return;
            }
            
            suggestionsDropdown.innerHTML = filtered.map(suggestion => 
                `<div class="suggestion-item" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;" 
                     onmouseover="this.style.backgroundColor='#f5f5f5'" 
                     onmouseout="this.style.backgroundColor='white'"
                     onclick="document.querySelector('.search-bar').value='${suggestion}'; document.querySelector('.search-bar').dispatchEvent(new Event('input')); suggestionsDropdown.style.display='none'">
                     ${suggestion}
                 </div>`
            ).join('');
            
            suggestionsDropdown.style.display = 'block';
        }
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', function(e) {
            if (!searchBar.parentElement.contains(e.target)) {
                suggestionsDropdown.style.display = 'none';
            }
        });
        
        // Function to perform search
        function performSearch(searchTerm) {
            console.log('Performing search for:', searchTerm);
            currentSearchTerm = searchTerm.toLowerCase().trim();
            
            if (currentSearchTerm === '') {
                // If search is empty, restore normal tab functionality
                isSearchActive = false;
                clearSearchHighlights();
                hideSearchMessage();
                restoreNormalTabDisplay();
                return;
            }
            
            isSearchActive = true;
            
            // Get all content sections to search through
            const contentSections = document.querySelectorAll('.tab-content, .sub-tab-content');
            
            let foundResults = false;
            let firstResult = null;
            let resultTabs = [];
            let foundSubTabs = [];
            
            contentSections.forEach(section => {
                const sectionText = section.textContent.toLowerCase();
                const sectionTitle = section.querySelector('.content-title, .section-title')?.textContent.toLowerCase() || '';
                const sectionTitles = section.querySelectorAll('.section-title');
                const sectionSubtitles = section.querySelectorAll('.section-subtitle');
                
                // Create a regex for flexible matching (not just word boundaries)
                const escapedTerm = currentSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const searchRegex = new RegExp(escapedTerm, 'i');
                
                // Check if search term matches title, section titles, or content
                const titleMatch = searchRegex.test(sectionTitle);
                const contentMatch = searchRegex.test(sectionText);
                
                // Check section titles and subtitles
                let sectionMatch = false;
                sectionTitles.forEach(title => {
                    if (searchRegex.test(title.textContent.toLowerCase())) {
                        sectionMatch = true;
                    }
                });
                sectionSubtitles.forEach(subtitle => {
                    if (searchRegex.test(subtitle.textContent.toLowerCase())) {
                        sectionMatch = true;
                    }
                });
                
                if (titleMatch || contentMatch || sectionMatch) {
                    // Mark sections as search results but keep them visible
                    section.classList.add('search-result');
                    foundResults = true;
                    
                    // Store first result for scrolling
                    if (!firstResult) {
                        firstResult = section;
                    }
                    
                    // Track which tabs have results (only add if not already present)
                    if (!resultTabs.includes(section.id)) {
                        resultTabs.push(section.id);
                    }
                    
                    // If this is a sub-tab, also track the parent tab
                    if (section.classList.contains('sub-tab-content')) {
                        if (!foundSubTabs.includes(section.id)) {
                            foundSubTabs.push(section.id);
                        }
                    }
                    
                    // Highlight matching text
                    highlightSearchTerm(section, currentSearchTerm);
                } else {
                    // Remove search result class but keep section visible
                    section.classList.remove('search-result');
                    // Clear highlights from this section only
                    const highlights = section.querySelectorAll('.search-highlight');
                    highlights.forEach(highlight => {
                        const parent = highlight.parentNode;
                        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                        parent.normalize();
                    });
                }
            });
            
            // Filter out main Rate Rationalisation tab if sub-tabs are present
            const filteredResultTabs = resultTabs.filter(tabId => {
                if (tabId === 'rate-rationalisation-content') {
                    // Check if any sub-tabs are in the results
                    const hasSubTabs = resultTabs.some(id => id.includes('-content') && id !== 'rate-rationalisation-content' && 
                        ['food-content', 'agriculture-content', 'textile-content', 'health-content', 'sin-luxury-content', 
                         'motor-vehicles-content', 'energy-content', 'stationery-content', 'paper-wood-content', 
                         'defence-content', 'construction-content', 'transportation-content', 'job-work-content', 
                         'hospitality-content', 'insurance-content', 'others-content'].includes(id));
                    return !hasSubTabs; // Only include main tab if no sub-tabs are present
                }
                return true;
            });
            
            // Store result tabs for keyboard navigation
            searchResultTabs = filteredResultTabs;
            currentResultIndex = 0;
            currentHighlightIndex = 0;
            
            // Wait a moment for highlighting to complete, then show results
            setTimeout(() => {
                showSearchResults(foundResults, currentSearchTerm, filteredResultTabs);
            }, 100);
            
            console.log('Search results:', { foundResults, resultTabs, firstResult: firstResult?.id, foundSubTabs });
            
            // Don't auto-navigate to first result - just show the search results overlay
        }
        
        // Function to restore normal tab display
        function restoreNormalTabDisplay() {
            const contentSections = document.querySelectorAll('.tab-content, .sub-tab-content');
            contentSections.forEach(section => {
                section.style.display = 'none';
                section.classList.remove('search-result');
            });
            
            // Show the currently active tab
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) {
                activeTab.style.display = 'block';
            }
            
            // Show the currently active sub-tab if we're in Rate Rationalisation
            const activeSubTab = document.querySelector('.sub-tab-content.active');
            if (activeSubTab) {
                activeSubTab.style.display = 'block';
            }
        }
        
        searchBar.addEventListener('input', function() {
            // Show suggestions
            showSuggestions(this.value);
            
            // Perform search with debouncing
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                performSearch(this.value);
            }, 300);
        });
        
        searchBar.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const searchTerm = this.value;
                
                // Clear any pending search timeout
                clearTimeout(this.searchTimeout);
                
                // If we're already in search mode, cycle through results
                if (isSearchActive) {
                    e.preventDefault();
                    if (searchResultTabs.length > 1) {
                        // Multiple tabs - cycle through tabs
                        currentResultIndex = (currentResultIndex + 1) % searchResultTabs.length;
                        currentHighlightIndex = 0; // Reset highlight index when switching tabs
                        navigateToSearchResult(searchResultTabs[currentResultIndex]);
                    } else if (searchResultTabs.length === 1) {
                        // Single tab - cycle through highlights within that tab
                        const currentTab = document.getElementById(searchResultTabs[0]);
                        if (currentTab) {
                            const highlights = currentTab.querySelectorAll('.search-highlight');
                            if (highlights.length > 1) {
                                currentHighlightIndex = (currentHighlightIndex + 1) % highlights.length;
                                scrollToHighlightedTerm(currentTab, currentSearchTerm);
                            } else {
                                navigateToSearchResult(searchResultTabs[0]);
                            }
                        }
                    }
                    return;
                }
                
                // Trigger search on Enter key
                performSearch(searchTerm);
                
                // Hide suggestions
                suggestionsDropdown.style.display = 'none';
                
                // Prevent form submission if this was in a form
                e.preventDefault();
            }
        });
        
        // Add keyboard navigation for search results
        searchBar.addEventListener('keydown', function(e) {
            if (isSearchActive) {
                if (e.key === 'ArrowRight' || e.key === 'Tab') {
                    e.preventDefault();
                    // If we have multiple tabs, cycle through tabs
                    if (searchResultTabs.length > 1) {
                        currentResultIndex = (currentResultIndex + 1) % searchResultTabs.length;
                        currentHighlightIndex = 0; // Reset highlight index when switching tabs
                        navigateToSearchResult(searchResultTabs[currentResultIndex]);
                    } else if (searchResultTabs.length === 1) {
                        // If only one tab, cycle through highlights within that tab
                        const currentTab = document.getElementById(searchResultTabs[0]);
                        if (currentTab) {
                            const highlights = currentTab.querySelectorAll('.search-highlight');
                            if (highlights.length > 1) {
                                currentHighlightIndex = (currentHighlightIndex + 1) % highlights.length;
                                scrollToHighlightedTerm(currentTab, currentSearchTerm);
                            }
                        }
                    }
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    // If we have multiple tabs, cycle through tabs
                    if (searchResultTabs.length > 1) {
                        currentResultIndex = currentResultIndex === 0 ? searchResultTabs.length - 1 : currentResultIndex - 1;
                        currentHighlightIndex = 0; // Reset highlight index when switching tabs
                        navigateToSearchResult(searchResultTabs[currentResultIndex]);
                    } else if (searchResultTabs.length === 1) {
                        // If only one tab, cycle through highlights within that tab
                        const currentTab = document.getElementById(searchResultTabs[0]);
                        if (currentTab) {
                            const highlights = currentTab.querySelectorAll('.search-highlight');
                            if (highlights.length > 1) {
                                currentHighlightIndex = currentHighlightIndex === 0 ? highlights.length - 1 : currentHighlightIndex - 1;
                                scrollToHighlightedTerm(currentTab, currentSearchTerm);
                            }
                        }
                    }
                }
            }
        });
        
        // Function to highlight search terms
        function highlightSearchTerm(element, searchTerm) {
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            const textNodes = [];
            let node;
            
            while (node = walker.nextNode()) {
                textNodes.push(node);
            }
            
            textNodes.forEach(textNode => {
                const parent = textNode.parentNode;
                if (parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE' && parent.tagName !== 'MARK') {
                    const text = textNode.textContent;
                    // Escape special regex characters and create a flexible regex
                    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`(${escapedTerm})`, 'gi');
                    const highlightedText = text.replace(regex, '<mark class="search-highlight" id="search-match">$1</mark>');
                    
                    if (highlightedText !== text) {
                        const wrapper = document.createElement('span');
                        wrapper.innerHTML = highlightedText;
                        parent.replaceChild(wrapper, textNode);
                    }
                }
            });
            
            // Scroll to the first highlighted term with better timing
            const firstHighlight = element.querySelector('.search-highlight');
            if (firstHighlight) {
                // Use requestAnimationFrame for smoother scrolling
                requestAnimationFrame(() => {
                    firstHighlight.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center',
                        inline: 'nearest'
                    });
                });
            }
        }
        
        // Function to show search results message
        function showSearchResults(foundResults, searchTerm, resultTabs = []) {
            let messageElement = document.getElementById('search-message');
            
            if (!foundResults && searchTerm !== '') {
                if (!messageElement) {
                    messageElement = document.createElement('div');
                    messageElement.id = 'search-message';
                    messageElement.className = 'search-message';
                    messageElement.style.backgroundColor = '#f0fdf4';
                    messageElement.style.borderColor = '#22c55e';
                    messageElement.style.color = '#166534';
                    messageElement.style.border = '1px solid #22c55e';
                    messageElement.style.borderRadius = '6px';
                    messageElement.style.padding = '12px';
                    messageElement.style.margin = '8px 0';
                    messageElement.style.boxShadow = '0 1px 3px rgba(34, 197, 94, 0.1)';
                    document.querySelector('.content-container').insertBefore(messageElement, document.querySelector('.content-container').firstChild);
                }
                messageElement.innerHTML = `
                    <p>No results found for "<strong style="color: #166534;">${searchTerm}</strong>".</p>
                    <p style="margin-top: 12px; font-weight: 500;">Try searching for:</p>
                    <ul style="text-align: left; margin: 10px 0; padding-left: 20px;">
                        <li>Industry names (e.g., "Food", "Textile", "Health")</li>
                        <li>HSN codes (e.g., "0401", "5205")</li>
                        <li>GST rates (e.g., "5%", "12%", "18%")</li>
                        <li>Product types (e.g., "milk", "bread", "medicines")</li>
                        <li>Keywords (e.g., "refund", "registration", "compensation")</li>
                    </ul>
                `;
                messageElement.style.display = 'block';
            } else if (foundResults && searchTerm !== '') {
                if (!messageElement) {
                    messageElement = document.createElement('div');
                    messageElement.id = 'search-message';
                    messageElement.className = 'search-message';
                    messageElement.style.backgroundColor = '#f0fdf4';
                    messageElement.style.borderColor = '#22c55e';
                    messageElement.style.color = '#166534';
                    messageElement.style.border = '1px solid #22c55e';
                    messageElement.style.borderRadius = '6px';
                    messageElement.style.padding = '12px';
                    messageElement.style.margin = '8px 0';
                    messageElement.style.boxShadow = '0 1px 3px rgba(34, 197, 94, 0.1)';
                    document.querySelector('.content-container').insertBefore(messageElement, document.querySelector('.content-container').firstChild);
                }
                
                // Count the actual highlighted matches instead of just sections
                const highlightedMatches = document.querySelectorAll('.search-highlight');
                const resultCount = highlightedMatches.length;
                let tabButtons = '';
                
                if (resultTabs.length > 0) {
                    // Create comprehensive tab names mapping including sub-tabs
                    const tabNames = {
                        // Main tabs
                        'overview-content': 'Overview',
                        'compensation-cess-content': 'Compensation Cess',
                        'intermediaries-content': 'Intermediaries',
                        'refunds-content': 'Refunds',
                        'rate-rationalisation-content': 'Rate Rationalisation',
                        'registration-content': 'Registration',
                        'supply-discounts-content': 'Supply & Discounts',
                        'gstat-content': 'GSTAT',
                        'anti-profiteering-content': 'Anti Profiteering',
                        'challenges-content': 'Challenges',
                        'time-of-supply-content': 'Time of Supply',
                        'faqs-content': 'FAQs',
                        // Sub-tabs under Rate Rationalisation
                        'food-content': 'Rate Rationalisation > Food',
                        'agriculture-content': 'Rate Rationalisation > Agriculture',
                        'textile-content': 'Rate Rationalisation > Textile & Footwear',
                        'health-content': 'Rate Rationalisation > Health',
                        'sin-luxury-content': 'Rate Rationalisation > Sin & Luxury',
                        'motor-vehicles-content': 'Rate Rationalisation > Motor Vehicles',
                        'energy-content': 'Rate Rationalisation > Energy',
                        'stationery-content': 'Rate Rationalisation > Stationery',
                        'paper-wood-content': 'Rate Rationalisation > Paper & Wood',
                        'defence-content': 'Rate Rationalisation > Defence',
                        'construction-content': 'Rate Rationalisation > Construction',
                        'transportation-content': 'Rate Rationalisation > Handicrafts & Lifestyle',
                        'job-work-content': 'Rate Rationalisation > Job Work',
                        'hospitality-content': 'Rate Rationalisation > Hospitality & Wellness',
                        'insurance-content': 'Rate Rationalisation > Insurance',
                        'handicrafts-lifestyle-content': 'Rate Rationalisation > Transportation',
                        'others-content': 'Rate Rationalisation > Others'
                    };
                    
                    tabButtons = `
                        <div style="margin-top: 8px;">
                            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                ${resultTabs.map(tabId => {
                                    const tabName = tabNames[tabId] || tabId.replace('-content', '');
                                    const isSubTab = tabId.includes('-content') && tabId !== 'rate-rationalisation-content' && 
                                        ['food-content', 'agriculture-content', 'textile-content', 'health-content', 'sin-luxury-content', 
                                         'motor-vehicles-content', 'energy-content', 'stationery-content', 'paper-wood-content', 
                                         'defence-content', 'construction-content', 'transportation-content', 'job-work-content', 
                                         'hospitality-content', 'insurance-content', 'handicrafts-lifestyle-content', 'others-content'].includes(tabId);
                                    
                                    return `<button onclick="navigateToSearchResult('${tabId}')" 
                                            style="background: ${isSubTab ? '#3b82f6' : '#22c55e'}; color: white; border: none; padding: 6px 12px; 
                                                   border-radius: 4px; cursor: pointer; font-size: 0.8rem; 
                                                   transition: all 0.2s; margin: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                                                   font-weight: 500; position: relative;"
                                            onmouseover="this.style.background='${isSubTab ? '#2563eb' : '#16a34a'}'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.15)'"
                                            onmouseout="this.style.background='${isSubTab ? '#3b82f6' : '#22c55e'}'; this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 2px rgba(0,0,0,0.1)'"
                                            title="${tabName}">
                                            ${tabName}
                                        </button>`;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
                
                messageElement.innerHTML = `
                    <p style="margin: 0 0 8px 0;">Found "<strong style="color: #1e40af;">${searchTerm}</strong>" in following tabs:</p>
                    ${tabButtons}
                    <p style="font-size: 0.8rem; margin: 8px 0 0 0; color: #6b7280;">
                        <span style="color: #22c55e;">●</span> Main tabs | 
                        <span style="color: #3b82f6;">●</span> Sub-tabs | 
                        Press <kbd style="background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.75rem;">Enter</kbd> to cycle through sections
                    </p>
                `;
                messageElement.style.display = 'block';
            } else if (messageElement) {
                messageElement.style.display = 'none';
            }
        }
        
        // Function to scroll to a specific highlighted term
        function scrollToHighlightedTerm(element, searchTerm) {
            const highlights = element.querySelectorAll('.search-highlight');
            if (highlights.length > 0) {
                // Remove active class from all highlights
                highlights.forEach(highlight => {
                    highlight.classList.remove('search-highlight-active');
                });
                
                // Use the highlight index for cycling through highlights within a tab
                const targetHighlight = highlights[currentHighlightIndex];
                
                if (targetHighlight) {
                    // Add active class to current highlight
                    targetHighlight.classList.add('search-highlight-active');
                    
                    requestAnimationFrame(() => {
                        targetHighlight.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'center',
                            inline: 'nearest'
                        });
                    });
                }
            }
        }
        
        // Function to navigate to a specific search result tab
        function navigateToSearchResult(tabId) {
            // Update current result index
            currentResultIndex = searchResultTabs.indexOf(tabId);
            
            // Clear current highlights first
            clearSearchHighlights();
            
            // Get the target tab
            const targetTab = document.getElementById(tabId);
            if (!targetTab) return;
            
            // Handle sub-tab navigation
            if (targetTab.classList.contains('sub-tab-content')) {
                // This is a sub-tab, we need to activate the parent tab first
                const parentTab = document.getElementById('rate-rationalisation-content');
                if (parentTab) {
                    // Hide all main tabs
                    const mainTabs = document.querySelectorAll('.tab-content');
                    mainTabs.forEach(tab => {
                        tab.style.display = 'none';
                        tab.classList.remove('active');
                    });
                    
                    // Show the parent tab
                    parentTab.style.display = 'block';
                    parentTab.classList.add('active');
                    
                    // Update main navigation
                    const navItems = document.querySelectorAll('.nav-item');
                    navItems.forEach(nav => nav.classList.remove('active'));
                    const rateRationalisationNav = Array.from(navItems).find(nav => 
                        nav.textContent.trim() === 'Rate Rationalisation'
                    );
                    if (rateRationalisationNav) {
                        rateRationalisationNav.classList.add('active');
                    }
                    
                    // Hide all sub-tabs
                    const subTabs = document.querySelectorAll('.sub-tab-content');
                    subTabs.forEach(subTab => {
                        subTab.style.display = 'none';
                        subTab.classList.remove('active');
                    });
                    
                    // Show the target sub-tab
                    targetTab.style.display = 'block';
                    targetTab.classList.add('active');
                    
                    // Update sub-tab navigation
                    const subNavItems = document.querySelectorAll('.sub-nav-item');
                    subNavItems.forEach(subNav => subNav.classList.remove('active'));
                    const correspondingSubNav = Array.from(subNavItems).find(subNav => 
                        subNav.getAttribute('data-subtab') === tabId
                    );
                    if (correspondingSubNav) {
                        correspondingSubNav.classList.add('active');
                    }
                }
            } else {
                // This is a main tab
                const contentSections = document.querySelectorAll('.tab-content');
                contentSections.forEach(section => {
                    section.style.display = 'none';
                    section.classList.remove('active');
                });
                
                targetTab.style.display = 'block';
                targetTab.classList.add('active');
                
                // Update navigation to show the correct active tab
                const navItems = document.querySelectorAll('.nav-item');
                navItems.forEach(nav => nav.classList.remove('active'));
                
                // Find the corresponding nav item
                const tabNames = {
                    'overview-content': 'Overview',
                    'compensation-cess-content': 'Compensation Cess',
                    'intermediaries-content': 'Intermediaries',
                    'refunds-content': 'Refunds',
                    'rate-rationalisation-content': 'Rate Rationalisation',
                    'registration-content': 'Registration',
                    'supply-discounts-content': 'Supply & Discounts',
                    'gstat-content': 'GSTAT',
                    'anti-profiteering-content': 'Anti Profiteering',
                    'challenges-content': 'Challenges',
                    'time-of-supply-content': 'Time of Supply',
                    'faqs-content': 'FAQs'
                };
                
                const tabName = tabNames[tabId];
                if (tabName) {
                    const correspondingNav = Array.from(navItems).find(nav => 
                        nav.textContent.trim() === tabName
                    );
                    if (correspondingNav) {
                        correspondingNav.classList.add('active');
                    }
                }
            }
            
            // Re-highlight search terms in the new tab
            if (currentSearchTerm) {
                highlightSearchTerm(targetTab, currentSearchTerm);
                
                // Scroll to the first highlighted term in this tab
                setTimeout(() => {
                    scrollToHighlightedTerm(targetTab, currentSearchTerm);
                }, 100);
            } else {
                // If no search term, just scroll to top of tab
                requestAnimationFrame(() => {
                    targetTab.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                    });
                });
            }
        }
        
        // Make navigateToSearchResult globally available
        window.navigateToSearchResult = navigateToSearchResult;
        
        // Add a test function for debugging
        window.testSearch = function(term) {
            console.log('Testing search with term:', term);
            searchBar.value = term;
            performSearch(term);
        };
        
        // Function to clear search highlights
        function clearSearchHighlights() {
            const highlights = document.querySelectorAll('.search-highlight');
            highlights.forEach(highlight => {
                const parent = highlight.parentNode;
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize();
            });
        }
        
        // Function to hide search message
        function hideSearchMessage() {
            const messageElement = document.getElementById('search-message');
            if (messageElement) {
                messageElement.style.display = 'none';
            }
        }
    }
    
    // Smooth scrolling for any internal links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add hover effects for better user experience
    const contentSections = document.querySelectorAll('.content-section');
    
    contentSections.forEach(section => {
        section.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        section.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
    
    // Add loading animation (optional)
    window.addEventListener('load', function() {
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.5s ease';
        
        setTimeout(() => {
            document.body.style.opacity = '1';
        }, 100);
    });
    
    // Print functionality (optional)
    const printButton = document.createElement('button');
    printButton.textContent = 'Print Page';
    printButton.className = 'print-button';
    printButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #3b82f6;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 14px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        z-index: 1000;
    `;
    
    printButton.addEventListener('click', function() {
        window.print();
    });
    
    document.body.appendChild(printButton);
    
    // Add print styles
    const printStyles = document.createElement('style');
    printStyles.textContent = `
        @media print {
            .print-button {
                display: none !important;
            }
            
            /* Page setup */
            @page {
                margin: 0.5in;
                size: A4;
            }
            
            body {
                font-size: 12pt;
                line-height: 1.4;
                color: #000;
                background: white !important;
            }
            
            /* Header styling */
            .header {
                background-color: #1e3a8a !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
                color: white !important;
                page-break-inside: avoid;
            }
            
            .header-title {
                color: white !important;
                font-size: 18pt;
            }
            
            .header-date {
                color: white !important;
                font-size: 10pt;
            }
            
            /* Navigation styling */
            .navigation {
                background: #3b82f6 !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
                page-break-inside: avoid;
            }
            
            .nav-item {
                color: white !important;
                background: transparent !important;
            }
            
            .nav-item.active {
                background: rgba(255, 255, 255, 0.2) !important;
            }
            
            /* Content styling */
            .content-container {
                box-shadow: none !important;
                border: 1px solid #ddd;
                page-break-inside: avoid;
            }
            
            .content-title {
                color: #1e3a8a !important;
                font-size: 16pt;
                page-break-after: avoid;
            }
            
            .section-title {
                color: #1e3a8a !important;
                font-size: 14pt;
                page-break-after: avoid;
            }
            
            .section-subtitle {
                color: #1e3a8a !important;
                font-size: 12pt;
                page-break-after: avoid;
            }
            
            /* Table styling */
            .rate-table {
                border-collapse: collapse;
                width: 100%;
                font-size: 10pt;
                page-break-inside: auto;
            }
            
            .rate-table thead {
                background-color: #1e3a8a !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
                color: white !important;
            }
            
            .rate-table th,
            .rate-table td {
                border: 1px solid #000;
                padding: 4pt;
                text-align: left;
            }
            
            .rate-table tbody tr:nth-child(even) {
                background-color: #f9f9f9 !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            
            /* Hide elements not needed in print */
            .sub-nav-container {
                display: none !important;
            }
            
            /* Show only active content */
            .tab-content:not(.active),
            .sub-tab-content:not(.active) {
                display: none !important;
            }
            
            /* Lists and other elements */
            .impact-list li {
                page-break-inside: avoid;
            }
            
            .highlight-card {
                page-break-inside: avoid;
                border: 1px solid #ddd;
                background: #f9f9f9 !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            
            .industry-category {
                page-break-inside: avoid;
                border: 1px solid #ddd;
                margin-bottom: 10pt;
            }
            
            /* Timeline styling */
            .timeline-item {
                page-break-inside: avoid;
                border: 1px solid #ddd;
                margin-bottom: 10pt;
            }
            
            .timeline-date {
                background: #3b82f6 !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
                color: white !important;
            }
        }
    `;
    document.head.appendChild(printStyles);
});
