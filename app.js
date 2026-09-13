
const state = {
  selectedDays: ["Monday", "Thursday", "Friday"],
  useUp: "Frozen turkey, Moroccan couscous",
  notes: "Light week. Quick meals. One vegetarian meal.",
  currentMealId: null,
  groceries: {}
};

const meals = [
  {
    id: "turkey-bowls",
    day: "Monday",
    title: "Ginger-Sesame Turkey Bowls",
    emoji: "🥢",
    time: 25,
    description: "Savory turkey with crisp vegetables, edamame, and rice.",
    tags: ["Uses turkey", "Kid friendly"],
    servings: 5,
    difficulty: "Easy",
    ingredients: [
      "1½–2 lb ground turkey",
      "1 bag shredded cabbage or coleslaw mix",
      "1 bag shelled edamame",
      "2–3 packs frozen jasmine or brown rice",
      "3 cloves garlic, minced",
      "1 tbsp fresh ginger, grated",
      "2 tbsp soy sauce",
      "1 tbsp sesame oil",
      "Scallions, optional",
      "Sesame seeds, optional"
    ],
    steps: [
      "Cook or heat the rice according to package directions.",
      "Brown the turkey in a large skillet over medium-high heat.",
      "Add garlic, ginger, soy sauce, and sesame oil.",
      "Stir in cabbage and edamame. Cook 4–5 minutes until just tender.",
      "Serve over rice. Add scallions, sesame seeds, or chili sauce for adults if desired."
    ]
  },
  {
    id: "moroccan-chicken",
    day: "Thursday",
    title: "Moroccan Chicken & Couscous",
    emoji: "🍋",
    time: 35,
    description: "Spiced chicken, roasted vegetables, couscous, and lemon yogurt.",
    tags: ["Uses couscous", "One-pan-ish"],
    servings: 5,
    difficulty: "Easy",
    ingredients: [
      "1½–2 lb boneless skinless chicken thighs",
      "2 zucchini",
      "2 bell peppers",
      "1 red onion",
      "Moroccan couscous",
      "1 cup plain Greek yogurt",
      "2 lemons",
      "Cilantro or parsley",
      "Ground cumin",
      "Smoked paprika",
      "Ground coriander",
      "Cinnamon",
      "Olive oil",
      "Salt and pepper"
    ],
    steps: [
      "Heat oven to 425°F.",
      "Cut vegetables into chunks and place on a sheet pan with chicken.",
      "Toss with olive oil, cumin, smoked paprika, coriander, a pinch of cinnamon, salt, and pepper.",
      "Roast 25–30 minutes, until chicken reaches 165°F.",
      "Prepare couscous according to package directions.",
      "Mix yogurt with lemon juice and a pinch of salt. Serve with chicken and couscous."
    ]
  },
  {
    id: "sweet-potato-tacos",
    day: "Friday",
    title: "Sweet Potato Black Bean Tacos",
    emoji: "🌮",
    time: 30,
    description: "Crispy sweet potatoes, black beans, avocado-lime slaw, and cheese.",
    tags: ["Vegetarian", "Kid friendly"],
    servings: 5,
    difficulty: "Easy",
    ingredients: [
      "2 medium sweet potatoes",
      "2 cans black beans",
      "Small flour or corn tortillas",
      "½ bag shredded cabbage or coleslaw mix",
      "2 avocados",
      "2 limes",
      "Shredded Mexican cheese",
      "Plain Greek yogurt or mayo",
      "Ground cumin",
      "Smoked paprika",
      "Garlic powder",
      "Salsa"
    ],
    steps: [
      "Cube sweet potatoes and toss with oil, cumin, smoked paprika, garlic powder, and salt.",
      "Air fry at 400°F for about 15 minutes, or roast at 425°F for 20–25 minutes.",
      "Warm black beans with a splash of water, cumin, and salt. Mash some of the beans.",
      "Mix cabbage with lime juice, yogurt or mayo, and a pinch of salt.",
      "Fill tortillas with beans, sweet potatoes, slaw, avocado, cheese, and salsa."
    ]
  }
];

const grocerySections = {
  Produce: [
    "Shredded green cabbage or coleslaw mix",
    "Fresh ginger",
    "Garlic",
    "Scallions",
    "2 zucchini",
    "2 bell peppers",
    "1 red onion",
    "3–4 lemons",
    "2 limes",
    "Cilantro or parsley",
    "2 medium sweet potatoes",
    "2 avocados"
  ],
  "Meat & Dairy": [
    "1½–2 lb boneless skinless chicken thighs",
    "1 large tub plain Greek yogurt",
    "Shredded Mexican cheese"
  ],
  Frozen: [
    "Shelled edamame",
    "2–3 packages frozen jasmine or brown rice"
  ],
  Pantry: [
    "2 cans black beans",
    "Small flour or corn tortillas",
    "Soy sauce",
    "Sesame oil",
    "Raisins or dried apricots",
    "Salsa"
  ],
  "Optional / Check Pantry": [
    "Ground cumin",
    "Smoked paprika",
    "Ground coriander",
    "Cinnamon",
    "Garlic powder",
    "Sesame seeds",
    "Chili crisp, sriracha, or gochujang"
  ]
};

function setView(view) {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  if (view === "plan") renderPlan();
  if (view === "meals") renderMeals();
  if (view === "groceries") renderGroceries();
}

function renderPlan() {
  document.getElementById("app").innerHTML = `
    <h1>Plan This Week</h1>
    <p class="subtle">Tell us about your week, and Mealz will turn it into a practical dinner plan.</p>

    <div class="section">
      <label class="label">Which days are you cooking?</label>
      <div class="day-grid">
        ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day => `
          <button class="day-btn ${state.selectedDays.includes(day) ? "selected" : ""}" data-day="${day}">
            ${day.slice(0,3)}
          </button>
        `).join("")}
      </div>
    </div>

    <div class="section">
      <label class="label" for="useUp">Any ingredients to use up?</label>
      <input id="useUp" value="${state.useUp}" />
    </div>

    <div class="section">
      <label class="label" for="notes">Anything else?</label>
      <textarea id="notes">${state.notes}</textarea>
    </div>

    <div class="section card household-card">
      <strong>Household</strong>
      <span>5 people · Trader Joe's first · Wegmans backup</span>
      <div class="small-note">Quick weeknight meals · Kid adaptable · Air fryer + Instant Pot</div>
    </div>

    <button id="planWeek" class="primary">Plan My Week ✨</button>
    <div class="small-note">Prototype v0.1 uses sample meals. AI generation comes next.</div>
  `;

  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const day = btn.dataset.day;
      if (state.selectedDays.includes(day)) {
        state.selectedDays = state.selectedDays.filter(d => d !== day);
      } else {
        state.selectedDays.push(day);
      }
      renderPlan();
    });
  });

  document.getElementById("planWeek").addEventListener("click", () => {
    state.useUp = document.getElementById("useUp").value;
    state.notes = document.getElementById("notes").value;
    setView("meals");
  });
}

function renderMeals() {
  document.getElementById("app").innerHTML = `
    <div class="row">
      <div>
        <h1>Your Meal Plan</h1>
        <p class="subtle">${meals.length} meals · Built for your week</p>
      </div>
      <button class="secondary" onclick="setView('plan')">Edit</button>
    </div>

    <div class="section">
      ${meals.map(meal => `
        <div class="card meal-card" data-meal="${meal.id}">
          <div class="meal-art">${meal.emoji}</div>
          <div>
            <div class="meal-day">${meal.day.toUpperCase()}</div>
            <div class="meal-title">${meal.title}</div>
            <div class="subtle">${meal.description}</div>
            <div class="meta">
              <span class="pill">${meal.time} min</span>
              ${meal.tags.map(tag => `<span class="pill">${tag}</span>`).join("")}
            </div>
          </div>
        </div>
      `).join("")}
    </div>

    <button id="swapStub" class="secondary" style="width:100%">+ Swap a Meal</button>
  `;

  document.querySelectorAll(".meal-card").forEach(card => {
    card.addEventListener("click", () => renderRecipe(card.dataset.meal));
  });

  document.getElementById("swapStub").addEventListener("click", () => {
    alert("Swap-a-meal is planned for v0.4. For now this prototype tests the main flow.");
  });
}

function renderRecipe(id) {
  const meal = meals.find(m => m.id === id);
  state.currentMealId = id;
  document.getElementById("app").innerHTML = `
    <button class="secondary" id="backMeals">← Back</button>
    <div class="recipe-hero">${meal.emoji}</div>
    <h1 class="recipe-title">${meal.title}</h1>
    <div class="meta">
      <span class="pill">${meal.time} min</span>
      <span class="pill">${meal.servings} servings</span>
      <span class="pill">${meal.difficulty}</span>
    </div>

    <div class="section">
      <h2>Ingredients</h2>
      <ul class="recipe-list">
        ${meal.ingredients.map(item => `<li><input type="checkbox" /><span>${item}</span></li>`).join("")}
      </ul>
    </div>

    <div class="section">
      <h2>Instructions</h2>
      <ol>
        ${meal.steps.map(step => `<li style="margin-bottom:12px; line-height:1.5">${step}</li>`).join("")}
      </ol>
    </div>

    <button class="primary" onclick="alert('Cooking mode is a future enhancement.')">▶ Start Cooking</button>
  `;
  document.getElementById("backMeals").addEventListener("click", renderMeals);
}

function renderGroceries() {
  const html = Object.entries(grocerySections).map(([category, items]) => `
    <section class="category">
      <h3>${category}</h3>
      <div>
        ${items.map((item, idx) => {
          const key = category + "::" + item;
          return `
            <label class="grocery-item ${state.groceries[key] ? "checked" : ""}">
              <input type="checkbox" data-key="${encodeURIComponent(key)}" ${state.groceries[key] ? "checked" : ""} />
              <span>${item}</span>
            </label>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");

  document.getElementById("app").innerHTML = `
    <h1>Grocery List</h1>
    <p class="subtle">Trader Joe's first. Use Wegmans as backup if an item isn't available.</p>
    ${html}
  `;

  document.querySelectorAll(".grocery-item input").forEach(box => {
    box.addEventListener("change", () => {
      const key = decodeURIComponent(box.dataset.key);
      state.groceries[key] = box.checked;
      box.closest(".grocery-item").classList.toggle("checked", box.checked);
    });
  });
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

renderPlan();
