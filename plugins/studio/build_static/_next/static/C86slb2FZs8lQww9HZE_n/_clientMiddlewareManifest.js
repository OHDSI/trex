self.__MIDDLEWARE_MATCHERS = [
  {
    "regexp": "^\\/plugins\\/trex\\/studio(?:\\/(_next\\/data\\/[^/]{1,}))?\\/api(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
    "originalSource": "/api/:function*"
  }
];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()