import json
import os
import random

import joblib
import mysql.connector
import pandas as pd
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

FEATURE_COLUMNS = [
	'user_budget',
	'user_days',
	'pref_food',
	'pref_beach',
	'pref_nature',
	'pref_museums',
	'pref_nightlife',
	'place_province',
	'place_category',
	'place_rating',
]


def get_db_connection():
	"""Open a MySQL connection using the same environment variables as Flask."""
	load_dotenv()
	return mysql.connector.connect(
		host=os.environ.get('MYSQLHOST'),
		user=os.environ.get('MYSQLUSER'),
		password=os.environ.get('MYSQLPASSWORD'),
		database=os.environ.get('MYSQLDATABASE'),
		port=os.environ.get('MYSQLPORT', '3306'),
	)


def parse_preferences(raw_preferences):
	"""Handle JSON or comma-separated preferences from older and newer rows."""
	if not raw_preferences:
		return []

	if isinstance(raw_preferences, list):
		return raw_preferences

	try:
		parsed = json.loads(raw_preferences)
		if isinstance(parsed, list):
			return parsed
	except Exception:
		pass

	return [item.strip() for item in str(raw_preferences).split(',') if item.strip()]


def build_feature_row(budget, num_days, preferences, place_province, place_category, place_rating, label):
	"""Create the same feature layout used by the live reranker."""
	preference_set = {item.lower() for item in parse_preferences(preferences)}
	return {
		'user_budget': budget or 'comfort',
		'user_days': int(num_days or 3),
		'pref_food': 1 if 'food' in preference_set else 0,
		'pref_beach': 1 if 'beach' in preference_set else 0,
		'pref_nature': 1 if 'nature' in preference_set else 0,
		'pref_museums': 1 if 'museums' in preference_set else 0,
		'pref_nightlife': 1 if 'nightlife' in preference_set else 0,
		'place_province': place_province or '',
		'place_category': place_category or '',
		'place_rating': float(place_rating or 3.5),
		'is_recommended': int(label),
	}


def load_database_examples():
	"""Build training rows from saved trips and explicit feedback."""
	try:
		connection = get_db_connection()
	except Exception as error:
		print(f"⚠️  Skipping database training data: {error}")
		return pd.DataFrame()

	cursor = connection.cursor(dictionary=True)
	rows = []

	try:
		cursor.execute(
			"""
			SELECT COLUMN_NAME
			FROM INFORMATION_SCHEMA.COLUMNS
			WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'itineraries'
			""",
			(os.environ.get('MYSQLDATABASE'),),
		)
		itinerary_columns = {row['COLUMN_NAME'] for row in cursor.fetchall()}

		required_columns = {'destination', 'budget', 'num_days', 'preferences'}
		if not required_columns.issubset(itinerary_columns):
			print("⚠️  Itinerary metadata columns are missing; using the bootstrap dataset for now.")
			return pd.DataFrame()

		cursor.execute(
			"""
			SELECT
				i.id AS itinerary_id,
				i.destination,
				i.budget,
				i.num_days,
				i.preferences,
				p.id AS place_id,
				p.city AS place_province,
				p.category AS place_category,
				p.rating AS place_rating
			FROM itinerary_items ii
			INNER JOIN itineraries i ON i.id = ii.itinerary_id
			INNER JOIN places p ON p.id = ii.place_id
			"""
		)
		selected_rows = cursor.fetchall()

		if not selected_rows:
			return pd.DataFrame()

		try:
			cursor.execute(
				"""
				SELECT
					tf.itinerary_id,
					tf.place_id,
					tf.rating_type,
					i.destination,
					i.budget,
					i.num_days,
					i.preferences,
					p.city AS place_province,
					p.category AS place_category,
					p.rating AS place_rating
				FROM trip_feedback tf
				INNER JOIN itineraries i ON i.id = tf.itinerary_id
				INNER JOIN places p ON p.id = tf.place_id
				"""
			)
			feedback_rows = cursor.fetchall()
		except Exception:
			feedback_rows = []
		feedback_lookup = {
			(row['itinerary_id'], row['place_id']): 1 if row.get('rating_type') == 'Best Pick' else 0
			for row in feedback_rows
		}

		cursor.execute(
			"SELECT id, city, category, rating FROM places"
		)
		place_rows = cursor.fetchall()

		selected_by_itinerary = {}
		for row in selected_rows:
			selected_by_itinerary.setdefault(row['itinerary_id'], []).append(row)

		rng = random.Random(42)
		for itinerary_id, itinerary_rows in selected_by_itinerary.items():
			first_row = itinerary_rows[0]
			selected_place_ids = {row['place_id'] for row in itinerary_rows}

			for row in itinerary_rows:
				label = feedback_lookup.get((itinerary_id, row['place_id']), 1)
				rows.append(build_feature_row(
					row['budget'],
					row['num_days'],
					row['preferences'],
					row['place_province'],
					row['place_category'],
					row['place_rating'],
					label,
				))

			negative_pool = [
				place for place in place_rows
				if place['id'] not in selected_place_ids and (
					place['city'] == first_row['destination'] or place['category'] == first_row['place_category']
				)
			]

			if not negative_pool:
				negative_pool = [place for place in place_rows if place['id'] not in selected_place_ids]

			sample_size = min(len(negative_pool), max(len(itinerary_rows), 3))
			for place in rng.sample(negative_pool, sample_size):
				rows.append(build_feature_row(
					first_row['budget'],
					first_row['num_days'],
					first_row['preferences'],
					place['city'],
					place['category'],
					place['rating'],
					0,
				))

		return pd.DataFrame(rows)
	finally:
		cursor.close()
		connection.close()


def load_csv_examples():
	"""Load the bootstrap dataset generated from the original heuristic system."""
	df = pd.read_csv('anotara_real_api_dataset.csv')
	return df[[*FEATURE_COLUMNS, 'is_recommended']]


print("🚀 Loading training data...")
csv_df = load_csv_examples()
db_df = load_database_examples()

if not db_df.empty and len(db_df) >= 50:
	print(f"✅ Using {len(db_df)} rows from saved trips and feedback.")
	df = db_df
elif not db_df.empty:
	print(f"✅ Combining {len(db_df)} database rows with the bootstrap dataset.")
	df = pd.concat([csv_df, db_df], ignore_index=True)
else:
	print("⚠️  No database examples found yet, training from the bootstrap dataset only.")
	df = csv_df

print("⚙️ Preprocessing data...")
X = df.drop(columns=['is_recommended'])
y = df['is_recommended']

X_encoded = pd.get_dummies(X, columns=['user_budget', 'place_province', 'place_category'])
model_columns = list(X_encoded.columns)
joblib.dump(model_columns, 'anotara_model_columns.pkl')

X_train, X_test, y_train, y_test = train_test_split(
	X_encoded,
	y,
	test_size=0.2,
	random_state=42,
	stratify=y if y.nunique() > 1 else None,
)

print("🧠 Training the reranker model...")
model = RandomForestClassifier(
	n_estimators=200,
	random_state=42,
	class_weight='balanced_subsample',
)
model.fit(X_train, y_train)

print("📊 Evaluating model accuracy...")
predictions = model.predict(X_test)
accuracy = accuracy_score(y_test, predictions)
print(f"\n✅ Model Accuracy: {accuracy * 100:.2f}%\n")
print("Detailed Classification Report:")
print(classification_report(y_test, predictions, zero_division=0))

joblib.dump(model, 'anotara_ml_model.pkl')
print("💾 Model saved successfully as 'anotara_ml_model.pkl'!")

training_summary = {
	'trained_at': pd.Timestamp.utcnow().isoformat(),
	'csv_rows': int(len(csv_df)),
	'database_rows': int(len(db_df)),
	'dataset_rows': int(len(df)),
	'accuracy': float(accuracy),
	'test_rows': int(len(X_test)),
}

with open('anotara_model_metrics.json', 'w', encoding='utf-8') as metrics_file:
	json.dump(training_summary, metrics_file, indent=2)

print("📝 Training summary saved as 'anotara_model_metrics.json'!")