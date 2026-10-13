import {i18n} from '../../shared/i18n';
const en={search:'Search members or invitations',clear:'Clear search',noMatchingMembers:'No members match this search.',noMatchingInvitations:'No invitations match this search.',back:'Back to members'};
const zh:Record<keyof typeof en,string>={search:'搜索成员或邀请',clear:'清除搜索',noMatchingMembers:'没有符合搜索条件的成员。',noMatchingInvitations:'没有符合搜索条件的邀请。',back:'返回成员列表'};
i18n.addResourceBundle('en-US','teamStates',en);
i18n.addResourceBundle('zh-CN','teamStates',zh);
