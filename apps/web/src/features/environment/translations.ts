import {i18n} from '../../shared/i18n';
const en={noMatch:'No variable definitions match these filters.',clear:'Clear variable filters',useProject:'View project definitions',useBase:'View base environment'};
const zh:Record<keyof typeof en,string>={noMatch:'没有符合当前筛选的变量定义。',clear:'清除变量筛选',useProject:'查看项目定义',useBase:'查看基础环境'};
i18n.addResourceBundle('en-US','environmentStates',en);
i18n.addResourceBundle('zh-CN','environmentStates',zh);
