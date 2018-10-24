import * as React from 'react';
import './GroupList.css';
declare type GroupListProps = {
    getGroups(): Array<string>;
};
declare class GroupList extends React.Component<GroupListProps, {}> {
    render(): JSX.Element;
}
export default GroupList;
