"""Hide each club entirely; predict its first three events using strictly earlier donor data."""
import pandas as pd
import numpy as np
from train_eval import ROOT, engineer, features, history_features, new_model, cold_start_rate

def evaluate_cold_start():
    df=pd.read_csv(ROOT/'data/sample_events.csv').sort_values(['date','start_hour'],kind='stable')
    results=[]
    for club,events in df.groupby('club',sort=True):
        errors={'flat':[],'layered':[],'campus':[]}
        for row in events.head(3).to_dict('records'):
            donors=df[(df.club!=club)&((df.date<row['date'])|((df.date==row['date'])&(df.start_hour<row['start_hour'])))]
            for mode in ['flat','layered']:
                f=history_features(donors.to_dict('records'),row,mode)
                if len(donors)<10: rate=f['club_type_rate']
                else:
                    tr=engineer(donors,mode);X=features(tr)
                    model=new_model().fit(X,tr.show_rate)
                    rate=np.clip(model.predict(features(pd.DataFrame([dict(row,**f)]),X.columns))[0],.03,1.6)
                if mode=="layered": rate=float(cold_start_rate(rate,pd.DataFrame([f])).iloc[0])
                errors[mode].append(abs(rate*row['rsvps']-row['checked_in']))
            campus=history_features(donors.to_dict('records'),row)['campus_rate']
            errors['campus'].append(abs(campus*row['rsvps']-row['checked_in']))
        results.append(dict(club=club,events=len(errors['flat']),**{k:np.mean(v) for k,v in errors.items()}))
    table=pd.DataFrame(results)
    overall={k:float(np.average(table[k],weights=table.events)) for k in errors}
    return table,overall

if __name__=='__main__':
    table,overall=evaluate_cold_start()
    print('SAMPLE DATA: leave-one-club-out first three events; MAE in people')
    print(table.to_string(index=False,float_format=lambda x:f'{x:.3f}'))
    print('Overall:',overall)
    print('Clubs improved:',int((table.layered<table.flat).sum()),'of',len(table))
