# train_model.py
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split


BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / 'anotara_real_api_dataset.csv'
MODEL_PATH = BASE_DIR / 'anotara_ml_model.pkl'
COLUMNS_PATH = BASE_DIR / 'anotara_model_columns.pkl'
PLACE_CATALOG_PATH = BASE_DIR / 'anotara_place_catalog.pkl'

TARGET_COLUMN = 'is_recommended'
CATEGORICAL_COLUMNS = ['user_budget', 'place_province', 'place_category']
PLACE_COLUMNS = ['place_name', 'place_province', 'place_category', 'place_rating']
BASE_USER_COLUMNS = ['user_budget', 'user_days']
RANDOM_STATE = 42


def get_preference_columns(df):
    """Return all user preference columns, such as pref_food and pref_beach."""
    return sorted(column for column in df.columns if column.startswith('pref_'))


def get_feature_columns(df):
    """Build the model features from user inputs plus candidate place context."""
    return [
        *BASE_USER_COLUMNS,
        *get_preference_columns(df),
        'place_province',
        'place_category',
        'place_rating',
    ]


def load_dataset(dataset_path=DATASET_PATH):
    """Load and validate the CSV training dataset."""
    df = pd.read_csv(dataset_path)
    preference_columns = get_preference_columns(df)
    required_columns = {
        *BASE_USER_COLUMNS,
        *preference_columns,
        *PLACE_COLUMNS,
        TARGET_COLUMN,
    }
    missing_columns = sorted(required_columns - set(df.columns))

    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {missing_columns}")

    df = df.dropna(subset=['user_budget', 'user_days', TARGET_COLUMN, 'place_name'])
    df['user_days'] = pd.to_numeric(df['user_days'], errors='coerce').fillna(1).astype(int)
    df['place_rating'] = pd.to_numeric(df['place_rating'], errors='coerce').fillna(3.5)
    df[TARGET_COLUMN] = pd.to_numeric(df[TARGET_COLUMN], errors='coerce').fillna(0).astype(int)

    for column in preference_columns:
        df[column] = pd.to_numeric(df[column], errors='coerce').fillna(0).astype(int)

    return df


def encode_features(df, model_columns=None):
    """One-hot encode categorical columns and optionally align to saved columns."""
    encoded_df = pd.get_dummies(df, columns=CATEGORICAL_COLUMNS)

    if model_columns is not None:
        return encoded_df.reindex(columns=model_columns, fill_value=0)

    return encoded_df


def build_place_catalog(df):
    """Keep one row per place for top-3 recommendation scoring."""
    return (
        df[PLACE_COLUMNS]
        .sort_values(['place_rating', 'place_name'], ascending=[False, True])
        .drop_duplicates(subset=['place_name', 'place_province', 'place_category'])
        .reset_index(drop=True)
    )


def train_model(dataset_path=DATASET_PATH):
    """Train the recommendation classifier and save the model artifacts."""
    df = load_dataset(dataset_path)
    feature_columns = get_feature_columns(df)

    X = df[feature_columns]
    y = df[TARGET_COLUMN]
    X_encoded = encode_features(X)
    model_columns = list(X_encoded.columns)

    stratify_target = y if y.nunique() > 1 and y.value_counts().min() >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X_encoded,
        y,
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=stratify_target,
    )

    model = RandomForestClassifier(
        n_estimators=300,
        random_state=RANDOM_STATE,
        class_weight='balanced_subsample',
        min_samples_leaf=2,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    accuracy = accuracy_score(y_test, predictions)

    joblib.dump(model, MODEL_PATH)
    joblib.dump(model_columns, COLUMNS_PATH)
    joblib.dump(build_place_catalog(df), PLACE_CATALOG_PATH)

    print(f"Model accuracy: {accuracy * 100:.2f}%")
    print("Classification report:")
    print(classification_report(y_test, predictions, zero_division=0))
    print(f"Saved model to: {MODEL_PATH}")
    print(f"Saved feature columns to: {COLUMNS_PATH}")
    print(f"Saved place catalog to: {PLACE_CATALOG_PATH}")

    return model, model_columns


def load_trained_model():
    """Load the trained classifier, encoded columns, and place catalog."""
    if not MODEL_PATH.exists() or not COLUMNS_PATH.exists() or not PLACE_CATALOG_PATH.exists():
        raise FileNotFoundError(
            "Missing model artifacts. Run `python train_model.py` before calling get_top_places()."
        )

    return {
        'model': joblib.load(MODEL_PATH),
        'model_columns': joblib.load(COLUMNS_PATH),
        'place_catalog': joblib.load(PLACE_CATALOG_PATH),
        'preference_columns': get_preference_columns(load_dataset()),
    }


def normalize_user_profile(user_profile, preference_columns):
    """Fill missing user inputs so inference always matches training columns."""
    normalized = {
        'user_budget': user_profile.get('user_budget', 'comfort'),
        'user_days': int(user_profile.get('user_days', 1)),
    }

    for column in preference_columns:
        normalized[column] = int(user_profile.get(column, 0))

    return normalized


def get_top_places(user_profile):
    """
    Return the top 3 recommended places for a new user profile.

    Example user_profile:
    {
        "user_budget": "comfort",
        "user_days": 3,
        "pref_food": 1,
        "pref_beach": 1,
        "pref_nature": 0,
        "pref_museums": 0,
        "pref_nightlife": 0,
    }
    """
    artifacts = load_trained_model()
    model = artifacts['model']
    model_columns = artifacts['model_columns']
    place_catalog = artifacts['place_catalog'].copy()
    user_features = normalize_user_profile(user_profile, artifacts['preference_columns'])

    for column, value in user_features.items():
        place_catalog[column] = value

    feature_columns = [
        *BASE_USER_COLUMNS,
        *artifacts['preference_columns'],
        'place_province',
        'place_category',
        'place_rating',
    ]
    candidate_features = place_catalog[feature_columns]
    encoded_candidates = encode_features(candidate_features, model_columns)
    probabilities = model.predict_proba(encoded_candidates)[:, 1]

    ranked_places = (
        place_catalog
        .assign(recommendation_probability=probabilities)
        .sort_values(
            ['recommendation_probability', 'place_rating', 'place_name'],
            ascending=[False, False, True],
        )
        .head(3)
    )

    return ranked_places[['place_name', 'place_province', 'place_category']].to_dict('records')


if __name__ == '__main__':
    train_model()

    sample_profile = {
        'user_budget': 'comfort',
        'user_days': 3,
        'pref_food': 1,
        'pref_beach': 1,
        'pref_nature': 0,
        'pref_museums': 0,
        'pref_nightlife': 0,
    }
    print("Sample top 3 recommendations:")
    print(get_top_places(sample_profile))