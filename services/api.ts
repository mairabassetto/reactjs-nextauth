import axios, { AxiosError } from 'axios';
import { parseCookies, setCookie } from 'nookies';

let cookies = parseCookies();
let isRefreshing = false;
let failedRequestQueue = [];

export const api = axios.create({
  baseURL: 'http://localhost:3333',
  headers: {
    Authorization: `Bearer ${cookies['nextauth.token']}`
  }
});

api.interceptors.response.use(response => {
  return response;
}, (error: AxiosError) => {
  if (error.response.status == 401) {
    if (error.response.data?.code == 'token.expired') {
      // renovar o token
      cookies = parseCookies();  // P/ ter os cookies atualizados nesse momento

      const { 'nextauth.refreshToken': refreshToken } = cookies;
      const originalConfig = error.config   //Toda config p/ repetir uma requisição para o backend

      if(!isRefreshing) {
        isRefreshing = true;

        api.post('/refresh', {
          refreshToken,
        }).then(response => {
          const { token } = response.data;

          setCookie(undefined, 'nextauth.token', token, {
            maxAge: 60 * 60 * 24 * 30,  // 30 dias
            path: '/'
          })
          setCookie(undefined, 'nextauth.refreshToken', response.data.refreshToken, {
            maxAge: 60 * 60 * 24 * 30,  // 30 dias
            path: '/'
          })

          api.defaults.headers['Authorization'] = `Bearer ${token}`;

          failedRequestQueue.forEach(request => request.onSucess(token));
          failedRequestQueue = [];
        }).catch(err => {
          failedRequestQueue.forEach(request => request.onFail(err));
          failedRequestQueue = [];
        }).finally(() => {
          isRefreshing = false
        })
      }

      return new Promise((resolve, reject) => {  //Promise é a única forma de deixar assíncrono
        failedRequestQueue.push({
          onSucess: (token: string) => {  //Quando o refresh for finalizado
            originalConfig.headers['Authorization'] = `Bearer ${token}`

            resolve(api(originalConfig))  //Resolve é um await, um aguardar para ser executado
          } , 
          onFail: (err: AxiosError) => {  //Caso o refresh tenha dado errado
            reject(err)
          }   
        })
      })
    } else {
      //deslogar o usuário
    }
  }
})