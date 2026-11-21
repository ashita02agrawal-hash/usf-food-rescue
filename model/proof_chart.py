"""Generate slide-ready SAMPLE DATA evidence from the shared evaluation function."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from train_eval import ROOT, evaluate, headline

FOOTNOTE = 'Sample data generated to mirror USF patterns. Test set: Fall 2026 weeks 9+.'
COLORS = {'tech':'#2563eb','professional':'#7c3aed','cultural':'#db2777',
          'residential':'#d97706','recreation':'#059669'}

def canvas(title):
    fig,ax=plt.subplots(figsize=(16,9),facecolor='#fafaf8')
    ax.set_facecolor('#fafaf8')
    ax.spines[['top','right']].set_visible(False)
    fig.text(.10,.93,title,fontsize=29,weight='bold',va='top')
    ax.tick_params(labelsize=18)
    fig.subplots_adjust(left=.10,right=.96,top=.77,bottom=.20)
    fig.text(.10,.06,FOOTNOTE,fontsize=15,color='#475569')
    return fig,ax

def main():
    r=evaluate();points=r['points'];out=ROOT/'model/out';out.mkdir(exist_ok=True)
    plt.rcParams.update({'font.family':'DejaVu Sans','axes.labelsize':21})
    fig,ax=canvas('How close were the turnout predictions?')
    limit=max(points.actual.max(),points.predicted.max())*1.12
    ax.plot([0,limit],[0,limit],'--',color='#64748b',linewidth=2,label='Perfect prediction')
    for cat,group in points.groupby('category'):
        ax.scatter(group.actual,group.predicted,s=105,color=COLORS.get(cat,'gray'),label=cat.capitalize(),alpha=.8,edgecolor='white')
    ax.set(xlim=(0,limit),ylim=(0,limit),xlabel='Actual turnout (people)',ylabel='Predicted turnout (people)')
    ax.legend(fontsize=15,loc='upper left',frameon=False,ncol=2)
    fig.text(.10,.85,f"Average error: {r['mae']:.1f} people across {r['test']} held-out events",fontsize=21,color='#475569')
    fig.savefig(out/'predicted_vs_actual.png',dpi=160);plt.close(fig)
    fig,ax=canvas('Less food left over on held-out events')
    waste=[s['servings_wasted'] for s in r['strategies']]
    bars=ax.bar(['Order for every RSVP','Campus average','Platewise'],waste,color=['#94a3b8','#64748b','#059669'],width=.58)
    ax.set_ylabel('Servings wasted');ax.set_ylim(0,max(waste)*1.22)
    for b,value in zip(bars,waste):ax.text(b.get_x()+b.get_width()/2,value+max(waste)*.025,f'{value:,.0f}',ha='center',fontsize=24,weight='bold')
    fig.text(.10,.85,f"{r['cut']*100:.1f}% less waste vs. ordering for every RSVP · 15% safety buffer",fontsize=20,color='#475569')
    fig.savefig(out/'waste_by_strategy.png',dpi=160);plt.close(fig)
    points.to_csv(out/'proof_points.csv',index=False)
    (out/'headline.txt').write_text(headline(r)+'\n',encoding='utf-8')
    print(headline(r));print(f'Charts and event-level evidence: {out}')

if __name__=='__main__':main()
