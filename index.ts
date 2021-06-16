import { BehaviorSubject, of, Subject, from, race } from 'rxjs'
import { map, withLatestFrom, mergeMap, filter, tap } from 'rxjs/operators'

export default class RxQueue<T> {
  public queue: T[] = []
  public out$ = new Subject<T>()
  public pushed = 0
  public sended = 0
  public awaited = 0

  constructor(values?: T[]) {
    if (values) this.queue = this.queue.concat(values)
  }

  public get isEmpty() {
    return this.queue.length === 0
  }
  public get size() {
    return this.queue.length
  }

  public push(value: T) {
    // console.log(this)
    if (this.completed) return
    if (this.awaited > 0) {
      this.awaited--
      this.out$.next(value)
      this.sended++
    } else {
      this.queue.push(value)
    }
    this.pushed++
    return this
  }

  public next() {
    if (this.completed) return
    if (!this.isEmpty) {
      const value = this.queue.shift()
      this.out$.next(value)
      this.sended++
      return value
    } else {
      this.awaited++
    }
  }

  subscribe = this.out$.subscribe.bind(this.out$)
  pipe = this.out$.pipe.bind(this.out$)
  complete = this.out$.complete.bind(this.out$)
  error = this.out$.error.bind(this.out$)

  public waitForNext = (): Promise<T> => {
    return new Promise(resolve => {
      const sub = this.out$.subscribe(value => {
        sub.unsubscribe()
        resolve(value)
      })
    })
  }
}

type DPC = [(...args: any) => void, ...args: any]

class Dispatcher {
  private state$ = new BehaviorSubject<string>('STATE_0')
  private action$ = new RxQueue<string>()
  private deferedAction$ = new RxQueue<string>()

  private waitUntilState = (state: string): Promise<void> => {
    console.log('waitUntilState begin')
    return new Promise(resolve => {
      const sub = this.state$.pipe(filter(s => s === state)).subscribe(s => {
        console.log('waitUntilState end')
        sub.unsubscribe()
        resolve()
      })
    })
  }

  // private dpcQue: DPC[] = []

  // private defer(...dpc: DPC) {
  //   this.dpcQue.push(dpc)
  // }

  // private execDpc = (dpc: DPC) => {
  //   console.log('exec dpc', dpc)
  //   const [fn, ...args] = dpc
  //   fn.apply(this, args)
  // }

  // private execDpcQue = () => {
  //   while(this.dpcQue.length > 0) {
  //     const dpc = this.dpcQue.pop()
  //     this.execDpc(dpc)
  //   }
  // }

  private defer(fn: (...args: any) => void, ...args: any) {
    fn.apply(this, args)
  }

  public dispatch = async (type: string, state: string) => {
    console.log(`>>> action ${type} (state: ${state})`)
    switch (type) {
      case 'LONG':
        if (state !== 'READY') {
          this.defer(async (type: string) => {
            console.log('start waiting for state READY')
            await this.waitUntilState('READY')
            this.deferedAction$.push(type)
            console.log('continue...')
          }, type)
          return state
        }
        return 'STATE_1'
      case 'SET_READY':
        return 'READY'
      case 'SHORT':
        return 'STATE_2'
    }
    return state
  }

  public action(a: string) {
    console.log('IN ACTION', a)
    this.action$.push(a)
  }

  private handleStateChange = (newState: string) => {
    console.log(`start state change ${this.state$.value} => ${newState}`)
    this.state$.next(newState)
    console.log(`<<< ${this.state$.value}`)
    // this.execDpcQue()
  }

  constructor() {
    race(this.deferedAction$.out$, this.action$.out$)
      .pipe(
        withLatestFrom(this.state$),
        mergeMap(([a, s]) => from(this.dispatch(a, s))),
      )
      .subscribe(this.handleStateChange)
    this.state$.subscribe(s => {
      console.log('go next, deferedAcrionsEmpty?', this.deferedAction$.isEmpty)
      this.deferedAction$.isEmpty
        ? this.action$.next()
        : this.deferedAction$.next()
    })
  }
}

async function main() {
  const d = new Dispatcher()
  d.action('LONG')
  d.action('SHORT')
  d.action('SET_READY')
}

main()
