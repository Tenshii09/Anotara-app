import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import joblib

print("🚀 Loading dataset...")
# 1. Load the dataset
df = pd.read_csv('anotara_real_api_dataset.csv')

# 2. Preprocessing (Preparing data for the math)
print("⚙️ Preprocessing data...")
# We drop 'place_name' because the model learns from features (categories, ratings), not specific names.
# We also separate our Target Variable (what we want to predict) from our Features.
X = df.drop(columns=['is_recommended', 'place_name'])
y = df['is_recommended']

# Machine Learning models only understand numbers, not text like 'low' or 'Palawan'.
# 'get_dummies' converts text categories into binary (0 or 1) columns (One-Hot Encoding).
X_encoded = pd.get_dummies(X, columns=['user_budget', 'place_province', 'place_category'])

# Save the exact column structure. This is CRITICAL for when you use the model in Flask later,
# so your web app knows exactly how to format the user's input.
model_columns = list(X_encoded.columns)
joblib.dump(model_columns, 'anotara_model_columns.pkl')

# 3. Train/Test Split
# We keep 20% of the data hidden from the model to test it like a final exam.
X_train, X_test, y_train, y_test = train_test_split(X_encoded, y, test_size=0.2, random_state=42)

# 4. Initialize and Train the Model
print("🧠 Training the Random Forest Model (This might take a few seconds)...")
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# 5. Evaluate the Model
print("📊 Evaluating model accuracy...")
predictions = model.predict(X_test)

accuracy = accuracy_score(y_test, predictions)
print(f"\n✅ Model Accuracy: {accuracy * 100:.2f}%\n")
print("Detailed Classification Report:")
print(classification_report(y_test, predictions))

# 6. Save the Trained Model
# We save it as a .pkl file so Flask can load it instantly without retraining.
joblib.dump(model, 'anotara_ml_model.pkl')
print("💾 Model saved successfully as 'anotara_ml_model.pkl'!")