import * as React from 'react';
import GroupTile from './GroupTile';
import Header from '../Header';
import './GroupList.css';

type GroupListProps = {
    getGroups(): Array<string>;
};

class GroupList extends React.Component<GroupListProps, {}> {
    render() {
        const groups =  this.props.getGroups();
        if (! groups) { return null; }
        return (
            <div>
                <Header groupControls={true} title="groups"/>
                {
                    groups.map(id => {
                        return (
                            <GroupTile key={id} name={id} />
                        );
                    })
                }
            </div>
        );
    }
}

export default GroupList;
