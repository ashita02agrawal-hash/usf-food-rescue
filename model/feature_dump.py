"""Machine-readable parity fixture; stdin is rows plus JS column definitions."""
import json
import sys
import pandas as pd
from train_eval import engineer, features

payload=json.load(sys.stdin)
frame=engineer(pd.DataFrame(payload['rows']))
names=[]
for col in payload['cols']:
    key=col['k']
    if ':' in key:
        group,value=key.split(':',1)
        key={'club':'club','type':'event_type','day':'day_of_week','loc':'location'}[group]+'_'+value
    elif key=='hour':key='start_hour'
    names.append(key)
matrix=features(frame).reindex(columns=names,fill_value=0).to_numpy().tolist()
history=frame[['campus_rate','campus_type_rate','category_rate','category_type_rate']].to_numpy().tolist()
json.dump(dict(matrix=matrix,history=history),sys.stdout,allow_nan=False)
