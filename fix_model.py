import joblib
import os

# Define the paths
ML_MODEL_PATH = 'anotara_ml_model.pkl'
ML_COLUMNS_PATH = 'anotara_model_columns.pkl'

print("🔄 Starting model version update...")

if os.path.exists(ML_MODEL_PATH):
    try:
        # 1. Load the existing model (you will see the warning here, it's okay)
        model = joblib.load(ML_MODEL_PATH)
        
        # 2. Re-save it immediately to update the metadata to version 1.4.0
        joblib.dump(model, ML_MODEL_PATH)
        
        print(f"✅ Success! {ML_MODEL_PATH} has been updated to your current scikit-learn version.")
    except Exception as e:
        print(f"❌ Error updating model: {e}")
else:
    print(f"❌ Could not find {ML_MODEL_PATH} in this folder.")

# Do the same for columns if needed
if os.path.exists(ML_COLUMNS_PATH):
    cols = joblib.load(ML_COLUMNS_PATH)
    joblib.dump(cols, ML_COLUMNS_PATH)
    print(f"✅ Success! {ML_COLUMNS_PATH} metadata updated.")